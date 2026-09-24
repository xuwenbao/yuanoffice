//! cdylib entry for wasm32-wasip1. One reactor, one session table.

use std::ffi::{CStr, CString};
use std::os::raw::c_char;
use std::sync::Mutex;

use crate::protocol;
use crate::WorkbookSessions;

static SESSIONS: Mutex<Option<WorkbookSessions>> = Mutex::new(None);

fn with_sessions(line: &str) -> String {
    let mut guard = SESSIONS.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    let mut table = guard.take().unwrap_or_else(WorkbookSessions::new);
    let reply = protocol::dispatch(line, &mut table);
    *guard = Some(table);
    reply
}

/// `line` is a JSON request. The returned pointer is a NUL-terminated reply
/// the host must pass back to `xlsx_free`.
#[no_mangle]
pub extern "C" fn xlsx_alloc(size: usize) -> *mut u8 {
    let layout = std::alloc::Layout::from_size_align(size.max(1), 1).unwrap();
    unsafe { std::alloc::alloc(layout) }
}

#[no_mangle]
pub extern "C" fn xlsx_dispatch(line: *const c_char) -> *mut c_char {
    if line.is_null() {
        return CString::new("{\"ok\":false,\"error\":\"null request\"}")
            .unwrap()
            .into_raw();
    }
    let text = unsafe { CStr::from_ptr(line) }.to_string_lossy();
    let reply = with_sessions(&text);
    CString::new(reply)
        .unwrap_or_else(|_| CString::new("{\"ok\":false,\"error\":\"reply had a nul\"}").unwrap())
        .into_raw()
}

#[no_mangle]
pub extern "C" fn xlsx_free(ptr: *mut c_char) {
    if ptr.is_null() {
        return;
    }
    unsafe {
        drop(CString::from_raw(ptr));
    }
}
