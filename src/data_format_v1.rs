use byteorder::{LittleEndian, WriteBytesExt};
use hashbrown::HashMap;

use crate::types::SpanMsg;

pub(crate) struct EncoderV1;

impl EncoderV1 {
    const OUT_BODY_CAP: usize = 4_194_304;
    const OUT_BUF_DELIM: char = '\n';
    const OUT_TOK_DELIM: char = ',';
    const VERSION_BYTES: &str = "1001";
    const SCOPE_REG_CAP: usize = 1000;

    pub(crate) fn encode(spans: &[SpanMsg], span_name_by_id: &[String]) -> String {
        let mut out_body = String::with_capacity(Self::OUT_BODY_CAP);
        out_body.push_str(Self::VERSION_BYTES);

        // Build scope name registry.
        let mut scope_id_by_name = HashMap::with_capacity(Self::SCOPE_REG_CAP);
        let mut scope_name_by_id = Vec::with_capacity(Self::SCOPE_REG_CAP);
        let mut span_buf = Vec::with_capacity(Self::OUT_BODY_CAP);

        // Build name registry and span buffer.
        for span in spans.iter() {
            if let Some(scope_id) = scope_id_by_name.get(span.scope) {
                Self::write_span(span, *scope_id, &mut span_buf);
            } else {
                let scope_id = scope_id_by_name.len() as u32;
                scope_id_by_name.insert(span.scope, scope_id);
                scope_name_by_id.push(span.scope);
                Self::write_span(span, scope_id, &mut span_buf);
            }
        }

        // Write data to output body.
        // Write span name registry.
        for name in span_name_by_id.iter() {
            out_body.push_str(name);
            out_body.push(Self::OUT_TOK_DELIM);
        }
        // Write span scope registry.
        out_body.push(Self::OUT_BUF_DELIM);
        for name in scope_name_by_id.iter() {
            out_body.push_str(name);
            out_body.push(Self::OUT_TOK_DELIM);
        }
        // Write spans.
        out_body.push(Self::OUT_BUF_DELIM);
        // trunk-ignore(clippy/deprecated)
        out_body.push_str(base64::encode(&span_buf).as_str());

        out_body
    }

    #[inline]
    fn write_span(s: &SpanMsg, scope_id: u32, buf: &mut Vec<u8>) {
        buf.write_u64::<LittleEndian>(s.span_id).unwrap();
        buf.write_u64::<LittleEndian>(s.parent_id).unwrap();
        buf.write_u32::<LittleEndian>(s.name_id).unwrap();
        buf.write_u32::<LittleEndian>(scope_id).unwrap();
        buf.write_u64::<LittleEndian>(s.duration.as_secs()).unwrap();
        buf.write_u32::<LittleEndian>(s.duration.subsec_nanos())
            .unwrap();
    }
}
