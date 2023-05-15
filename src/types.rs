#[derive(Debug, Clone, Copy)]
pub(crate) struct SpanMsg {
    pub(crate) span_id: u64,
    pub(crate) parent_id: u64,
    pub(crate) name_id: u32,
    pub(crate) scope: &'static str,
    pub(crate) duration: std::time::Duration,
}
