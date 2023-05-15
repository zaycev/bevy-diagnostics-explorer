mod types;
mod data_format_v1;
pub mod prelude {
    pub use crate::DiagnosticExplorerAgentPlugin;
}

use std::error::Error;
use std::fmt::Debug;

use bevy_app::prelude::{App, Plugin};
use bevy_ecs::prelude::Resource;
use bevy_utils::tracing::{
    field::{Field, Visit},
    Id, Subscriber,
};
use hashbrown::HashMap;
use tracing::span::Attributes;
use tracing_subscriber::layer::{Context, Layer, SubscriberExt};

use crate::types::SpanMsg;

const SPAN_LOCAL_BUF_CAP: usize = 10_000;
const SPAN_SHARED_BUF_CAP: usize = 100_000;
const NAME_REGISTRY_CAP: usize = 1000;

pub struct DiagnosticExplorerAgentPlugin;

impl Plugin for DiagnosticExplorerAgentPlugin {
    fn build(&self, app: &mut App) {
        // Setup registries, channels and buffers.
        let id_by_name_reg = std::sync::Arc::new(std::sync::Mutex::new(HashMap::with_capacity(
            NAME_REGISTRY_CAP,
        )));
        let name_by_id_reg =
            std::sync::Arc::new(std::sync::Mutex::new(Vec::with_capacity(NAME_REGISTRY_CAP)));
        let shared_span_buf = std::sync::Arc::new(std::sync::Mutex::new(SharedSpans {
            buf: Vec::with_capacity(SPAN_SHARED_BUF_CAP),
        }));

        // Channel to send data from subscriber to processor.
        let (data_snd, data_rcv) = crossbeam_channel::bounded::<SpanMsg>(4096);

        // Subscriber that will record instrumented data and send it to the processor.
        let tracing_layer = AgentTracingLayer {
            data_chan: data_snd,
            id_by_name: id_by_name_reg,
            name_by_id: name_by_id_reg.clone(),
        };
        let tracing_subscriber =
            tracing_subscriber::registry::Registry::default().with(tracing_layer);

        // Require only one subscriber.
        if tracing::subscriber::set_global_default(tracing_subscriber).is_err() {
            panic!(
                "Global tracing subscriber was already set. Did you forget to disable LogPlugin?"
            );
        }

        // Make pointers for server and processor.
        let server_traces = shared_span_buf.clone();
        let server_name_by_id = name_by_id_reg;
        let processor_traces = shared_span_buf;

        // Create http server thread and span processor thread.
        app.insert_resource(DiagnosticsExplorerResources {
            // Server thread will be running actix runtime and serve spans.
            server_thread: std::thread::spawn(move || {
                http_server(server_traces, server_name_by_id).unwrap();
            }),

            // Span processor thread will be running in a loop and process spans
            // and store them in a shader buffer.
            span_processor: std::thread::spawn(move || {
                let traces = processor_traces;

                // Save all spans to a local buffer before
                // flushing them to the shader buffer to minimize locking.
                let mut buf = Vec::with_capacity(SPAN_LOCAL_BUF_CAP);

                loop {
                    if let Ok(msg) = data_rcv.recv() {
                        buf.push(msg);

                        // Drain local buffer into shader buffer.
                        if buf.len() == SPAN_LOCAL_BUF_CAP {
                            traces.lock().unwrap().buf.append(&mut buf)
                        }
                    }
                }
            }),
        });
    }
}

struct SharedSpans {
    pub buf: Vec<SpanMsg>,
}

// Tracing layer will be called on each span enter/exit event.
// It will record span data and send it to the processor.
// In addition it will build a registry of span names.
pub struct AgentTracingLayer {
    data_chan: crossbeam_channel::Sender<SpanMsg>,
    id_by_name: std::sync::Arc<std::sync::Mutex<HashMap<String, u32>>>,
    name_by_id: std::sync::Arc<std::sync::Mutex<Vec<String>>>,
}

impl<S: Subscriber + for<'lookup> tracing_subscriber::registry::LookupSpan<'lookup>> Layer<S>
    for AgentTracingLayer
{
    // This will be called on each span enter event
    // to record span.
    fn on_new_span(&self, attrs: &Attributes<'_>, id: &Id, ctx: Context<'_, S>) {
        let span = ctx.span(id).unwrap();
        let val = {
            // Try to extract and record span name.
            let id_by_name: &mut HashMap<String, u32> = &mut self.id_by_name.lock().unwrap();
            let name_by_id: &mut Vec<String> = &mut self.name_by_id.lock().unwrap();
            let mut visitor = NameVisitor {
                field: None,
                id_by_name,
                name_by_id,
            };
            // Run visitor.
            attrs.record(&mut visitor);
            visitor.field
        };
        if let Some(value) = val {
            span.extensions_mut().insert(value);
        }
    }

    // Add span enter time.
    fn on_enter(&self, id: &Id, ctx: Context<'_, S>) {
        if let Some(span) = ctx.span(id) {
            let mut extensions = span.extensions_mut();
            if extensions.get_mut::<std::time::Instant>().is_none() {
                extensions.insert(std::time::Instant::now());
            }
        }
    }

    // Add span duration and send it to the processor.
    fn on_exit(&self, id: &Id, ctx: Context<'_, S>) {
        if let Some(span) = ctx.span(id) {
            let mut extensions = span.extensions_mut();

            let started_at = if let Some(started_at) = extensions.get_mut::<std::time::Instant>() {
                *started_at
            } else {
                return;
            };

            let name_id = if let Some(name_id) = extensions.get_mut::<u32>() {
                *name_id
            } else {
                return;
            };

            let started_at = started_at;
            let finished_at = std::time::Instant::now();
            let scope = span.name();
            let span_id = id.into_u64();
            let parent_id = span.parent().map_or(0, |span| span.id().into_u64());
            let duration = finished_at.duration_since(started_at);

            self.data_chan
                .send(SpanMsg {
                    span_id,
                    parent_id,
                    scope,
                    name_id,
                    duration,
                })
                .unwrap();
        }
    }
}

struct NameVisitor<'a> {
    id_by_name: &'a mut HashMap<String, u32>,
    name_by_id: &'a mut Vec<String>,
    field: Option<u32>,
}

impl Visit for NameVisitor<'_> {
    fn record_f64(&mut self, _: &Field, _: f64) {}
    fn record_i64(&mut self, _: &Field, _: i64) {}
    fn record_u64(&mut self, _: &Field, _: u64) {}
    fn record_i128(&mut self, _: &Field, _: i128) {}
    fn record_u128(&mut self, _: &Field, _: u128) {}
    fn record_bool(&mut self, _: &Field, _: bool) {}
    fn record_str(&mut self, field: &Field, value: &str) {
        // Extract name field.
        if field.name() == "name" {
            if let Some(id) = self.id_by_name.get(value) {
                self.field = Some(*id);

            } else {
                let id = self.id_by_name.len() as u32;
                self.id_by_name.insert(value.to_string(), id);
                self.name_by_id.push(value.to_string());
                self.field = Some(id);

            }
        }
    }
    fn record_error(&mut self, _: &Field, _: &(dyn Error + 'static)) {}
    fn record_debug(&mut self, _: &Field, _: &dyn Debug) {}
}


#[derive(Clone)]
struct HttpServerResources {
    pub traces: std::sync::Arc<std::sync::Mutex<SharedSpans>>,
    pub name_by_id: std::sync::Arc<std::sync::Mutex<Vec<String>>>,
}

#[actix_web::get("/v1/spans")]
async fn get_spans(state: actix_web::web::Data<HttpServerResources>) -> impl actix_web::Responder {
    let encoded = crate::data_format_v1::EncoderV1::encode(
        &state.traces.lock().unwrap().buf,
        &state.name_by_id.lock().unwrap(),
    );
    state.traces.lock().unwrap().buf.clear();
    actix_web::HttpResponse::Ok().body(encoded)
}

#[actix_web::main]
async fn http_server(
    traces: std::sync::Arc<std::sync::Mutex<SharedSpans>>,
    name_by_id: std::sync::Arc<std::sync::Mutex<Vec<String>>>,
) -> std::io::Result<()> {
    actix_web::HttpServer::new(move || {
        actix_web::App::new()
            .app_data(actix_web::web::Data::new(HttpServerResources {
                traces: traces.clone(),
                name_by_id: name_by_id.clone(),
            }))
            .service(get_spans)
    })
    .bind(("127.0.0.1", 5444))?
    .run()
    .await
}

#[derive(Resource)]
pub struct DiagnosticsExplorerResources {
    pub server_thread: std::thread::JoinHandle<()>,
    pub span_processor: std::thread::JoinHandle<()>,
}
