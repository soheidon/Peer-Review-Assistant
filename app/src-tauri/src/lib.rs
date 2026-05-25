use std::fs;
use tauri::Manager;

#[tauri::command]
fn get_release_path(app: tauri::AppHandle) -> Result<String, String> {
    let resource_dir = app
        .path()
        .resource_dir()
        .map_err(|e| e.to_string())?;
    Ok(resource_dir.to_string_lossy().to_string())
}

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_text_file(path: String, content: String) -> Result<(), String> {
    if let Some(parent) = std::path::Path::new(&path).parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&path, &content).map_err(|e| e.to_string())
}

#[tauri::command]
fn remove_file(path: String) -> Result<(), String> {
    fs::remove_file(&path).map_err(|e| e.to_string())
}

// ── Windows Hello / DPAPI commands ──────────────────────────────────────
// These commands are only compiled on Windows. Non-Windows stubs follow.

#[cfg(windows)]
mod windows_hello {
    use windows::core::HSTRING;
    use windows::Security::Credentials::UI::{
        UserConsentVerifier, UserConsentVerifierAvailability,
        UserConsentVerificationResult,
    };
    use windows::Win32::Security::Cryptography::{
        CryptProtectData, CryptUnprotectData, CRYPT_INTEGER_BLOB,
        CRYPTPROTECT_UI_FORBIDDEN,
    };
    use windows::Win32::Foundation::LocalFree;

    /// RAII wrapper that zeroes and frees a DPAPI-allocated data blob.
    struct DataBlob {
        inner: CRYPT_INTEGER_BLOB,
    }

    impl DataBlob {
        fn as_bytes(&self) -> &[u8] {
            if self.inner.pbData.is_null() || self.inner.cbData == 0 {
                return &[];
            }
            unsafe {
                std::slice::from_raw_parts(self.inner.pbData, self.inner.cbData as usize)
            }
        }
    }

    impl Drop for DataBlob {
        fn drop(&mut self) {
            if !self.inner.pbData.is_null() && self.inner.cbData > 0 {
                unsafe {
                    // Zero the buffer before freeing
                    std::ptr::write_bytes(self.inner.pbData, 0, self.inner.cbData as usize);
                    let _ = LocalFree(Some(windows::Win32::Foundation::HLOCAL(self.inner.pbData as *mut _)));
                }
                self.inner.pbData = std::ptr::null_mut();
                self.inner.cbData = 0;
            }
        }
    }

    /// Check whether Windows Hello / PIN / biometric is available on this device.
    pub fn check_available() -> Result<bool, String> {
        let op = UserConsentVerifier::CheckAvailabilityAsync()
            .map_err(|e| format!("Failed to check availability: {}", e))?;
        // IAsyncOperation::get() blocks the calling thread until complete
        let result = op.get()
            .map_err(|e| format!("Failed to get availability result: {}", e))?;

        Ok(matches!(
            result,
            UserConsentVerifierAvailability::Available
        ))
    }

    /// Trigger a Windows Hello / PIN / fingerprint prompt.
    /// `message` is shown in the dialog. Returns true if user passes.
    pub fn verify_user(message: &str) -> Result<bool, String> {
        let msg_hstring = HSTRING::from(message);
        let op = UserConsentVerifier::RequestVerificationAsync(&msg_hstring)
            .map_err(|e| format!("Failed to request verification: {}", e))?;
        let result = op.get()
            .map_err(|e| format!("Failed to get verification result: {}", e))?;

        Ok(result == UserConsentVerificationResult::Verified)
    }

    /// Encrypt data with DPAPI, bound to the current Windows user.
    /// `entropy` is optional additional binding (e.g., slot name).
    pub fn protect(data: &[u8], entropy: &[u8]) -> Result<Vec<u8>, String> {
        let data_in = CRYPT_INTEGER_BLOB {
            cbData: data.len() as u32,
            pbData: data.as_ptr() as *mut u8,
        };

        let entropy_blob = if entropy.is_empty() {
            None
        } else {
            Some(CRYPT_INTEGER_BLOB {
                cbData: entropy.len() as u32,
                pbData: entropy.as_ptr() as *mut u8,
            })
        };

        let mut data_out = CRYPT_INTEGER_BLOB {
            cbData: 0,
            pbData: std::ptr::null_mut(),
        };

        let entropy_ptr: Option<*const CRYPT_INTEGER_BLOB> = entropy_blob
            .as_ref()
            .map(|b| b as *const CRYPT_INTEGER_BLOB);

        let ok = unsafe {
            CryptProtectData(
                &data_in as *const CRYPT_INTEGER_BLOB,
                None,                    // szDataDescr
                entropy_ptr,             // pOptionalEntropy
                None,                    // pvReserved
                None,                    // pPromptStruct
                CRYPTPROTECT_UI_FORBIDDEN,
                &mut data_out as *mut CRYPT_INTEGER_BLOB,
            )
        };

        if ok.is_err() || data_out.pbData.is_null() {
            return Err("DPAPI CryptProtectData failed".into());
        }

        let blob = DataBlob { inner: data_out };
        let result = blob.as_bytes().to_vec();
        Ok(result)
    }

    /// Decrypt data previously protected with `protect`.
    /// `entropy` must match the value used during encryption.
    pub fn unprotect(encrypted: &[u8], entropy: &[u8]) -> Result<String, String> {
        let data_in = CRYPT_INTEGER_BLOB {
            cbData: encrypted.len() as u32,
            pbData: encrypted.as_ptr() as *mut u8,
        };

        let entropy_blob = if entropy.is_empty() {
            None
        } else {
            Some(CRYPT_INTEGER_BLOB {
                cbData: entropy.len() as u32,
                pbData: entropy.as_ptr() as *mut u8,
            })
        };

        let mut data_out = CRYPT_INTEGER_BLOB {
            cbData: 0,
            pbData: std::ptr::null_mut(),
        };

        let entropy_ptr: Option<*const CRYPT_INTEGER_BLOB> = entropy_blob
            .as_ref()
            .map(|b| b as *const CRYPT_INTEGER_BLOB);

        let ok = unsafe {
            CryptUnprotectData(
                &data_in as *const CRYPT_INTEGER_BLOB,
                None,                    // ppszDataDescr
                entropy_ptr,             // pOptionalEntropy
                None,                    // pvReserved
                None,                    // pPromptStruct
                0,                       // dwFlags
                &mut data_out as *mut CRYPT_INTEGER_BLOB,
            )
        };

        if ok.is_err() || data_out.pbData.is_null() {
            return Err("DPAPI CryptUnprotectData failed".into());
        }

        let blob = DataBlob { inner: data_out };
        let plaintext = String::from_utf8(blob.as_bytes().to_vec())
            .map_err(|e| format!("Invalid UTF-8 in decrypted data: {}", e))?;
        Ok(plaintext)
    }
}

// ── Tauri commands (platform-gated) ─────────────────────────────────────

#[tauri::command]
#[cfg(windows)]
fn windows_hello_available() -> Result<bool, String> {
    windows_hello::check_available()
}

#[tauri::command]
#[cfg(not(windows))]
fn windows_hello_available() -> Result<bool, String> {
    Ok(false)
}

#[tauri::command]
#[cfg(windows)]
fn windows_hello_verify(message: String) -> Result<bool, String> {
    windows_hello::verify_user(&message)
}

#[tauri::command]
#[cfg(not(windows))]
fn windows_hello_verify(_message: String) -> Result<bool, String> {
    Err("Windows Hello is not available on this platform.".into())
}

#[tauri::command]
#[cfg(windows)]
fn windows_hello_protect(data: String, key_name: String) -> Result<String, String> {
    // Step 1: verify user presence
    let verified = windows_hello::verify_user(
        "APIキーを保護して保存するために本人確認が必要です",
    )?;
    if !verified {
        return Err("User verification was cancelled or failed.".into());
    }

    // Step 2: DPAPI-protect with entropy bound to key_name
    let protected = windows_hello::protect(data.as_bytes(), key_name.as_bytes())?;

    // Return base64-encoded
    Ok(base64_encode(&protected))
}

#[tauri::command]
#[cfg(not(windows))]
fn windows_hello_protect(_data: String, _key_name: String) -> Result<String, String> {
    Err("Windows Hello is not available on this platform.".into())
}

#[tauri::command]
#[cfg(windows)]
fn windows_hello_unprotect(encrypted_base64: String, key_name: String) -> Result<String, String> {
    // Step 1: verify user presence
    let verified = windows_hello::verify_user(
        "APIキーを復号するために本人確認が必要です",
    )?;
    if !verified {
        return Err("User verification was cancelled or failed.".into());
    }

    // Step 2: decode base64
    let encrypted = base64_decode(&encrypted_base64)
        .map_err(|e| format!("Failed to decode base64: {}", e))?;

    // Step 3: DPAPI-unprotect
    let plaintext = windows_hello::unprotect(&encrypted, key_name.as_bytes())?;

    Ok(plaintext)
}

#[tauri::command]
#[cfg(not(windows))]
fn windows_hello_unprotect(_encrypted_base64: String, _key_name: String) -> Result<String, String> {
    Err("Windows Hello is not available on this platform.".into())
}

// ── Simple base64 helpers (no external crate needed) ────────────────────

fn base64_encode(data: &[u8]) -> String {
    const CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut result = String::with_capacity((data.len() + 2) / 3 * 4);
    for chunk in data.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = if chunk.len() > 1 { chunk[1] as u32 } else { 0 };
        let b2 = if chunk.len() > 2 { chunk[2] as u32 } else { 0 };
        let triple = (b0 << 16) | (b1 << 8) | b2;
        result.push(CHARS[((triple >> 18) & 0x3F) as usize] as char);
        result.push(CHARS[((triple >> 12) & 0x3F) as usize] as char);
        if chunk.len() > 1 {
            result.push(CHARS[((triple >> 6) & 0x3F) as usize] as char);
        } else {
            result.push('=');
        }
        if chunk.len() > 2 {
            result.push(CHARS[(triple & 0x3F) as usize] as char);
        } else {
            result.push('=');
        }
    }
    result
}

fn base64_decode(encoded: &str) -> Result<Vec<u8>, String> {
    const DECODE: [i8; 128] = {
        let mut table = [-1i8; 128];
        let chars = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        let mut i = 0;
        while i < chars.len() {
            table[chars[i] as usize] = i as i8;
            i += 1;
        }
        table
    };

    let encoded = encoded.trim_end_matches('=');
    let mut result = Vec::with_capacity(encoded.len() * 3 / 4);
    let bytes = encoded.as_bytes();

    let mut i = 0;
    while i < bytes.len() {
        let b0 = DECODE.get(bytes[i] as usize).copied().unwrap_or(-1);
        let b1 = DECODE.get(bytes.get(i + 1).copied().unwrap_or(0) as usize).copied().unwrap_or(-1);
        let b2 = DECODE.get(bytes.get(i + 2).copied().unwrap_or(0) as usize).copied().unwrap_or(-1);
        let b3 = DECODE.get(bytes.get(i + 3).copied().unwrap_or(0) as usize).copied().unwrap_or(-1);

        if b0 < 0 || b1 < 0 {
            return Err("Invalid base64 character".into());
        }

        let triple = ((b0 as u32) << 18) | ((b1 as u32) << 12);
        result.push((triple >> 16) as u8);

        if b2 >= 0 {
            result.push(((triple >> 8) & 0xFF) as u8);
        }
        if b3 >= 0 {
            result.push((triple & 0xFF) as u8);
        }

        i += 4;
    }

    Ok(result)
}

// ── App entry point ─────────────────────────────────────────────────────

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            get_release_path,
            read_text_file,
            write_text_file,
            remove_file,
            windows_hello_available,
            windows_hello_verify,
            windows_hello_protect,
            windows_hello_unprotect,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
