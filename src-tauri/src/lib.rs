use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::PathBuf;
use std::process::Command;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
#[cfg(target_os = "windows")]
use windows_sys::Win32::Foundation::{CloseHandle, INVALID_HANDLE_VALUE};
#[cfg(target_os = "windows")]
use windows_sys::Win32::System::Diagnostics::ToolHelp::{
  CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W, TH32CS_SNAPPROCESS,
};

#[derive(Serialize)]
struct SuperpowerSkill {
  name: String,
  enabled: bool,
}

#[derive(Serialize)]
struct ClaudeInstalledPlugin {
  key: String,
  version: String,
}

#[derive(Serialize)]
struct ClaudeRuntimeState {
  installed_plugins: Vec<ClaudeInstalledPlugin>,
  enabled_plugins: HashMap<String, bool>,
  plugin_configs: HashMap<String, Value>,
}

#[derive(Serialize)]
struct CcSwitchRuntimeState {
  exists: bool,
  settings: Value,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GitChangePreview {
  id: String,
  path: String,
  summary: String,
  timestamp: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct GitReadOnlyStatus {
  available: bool,
  repo_path: String,
  branch: Option<String>,
  remote: Option<String>,
  ahead: u32,
  behind: u32,
  local_changes: Vec<GitChangePreview>,
  remote_changes: Vec<GitChangePreview>,
  last_read_at: Option<String>,
  error: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CcSwitchSqliteSkill {
  id: String,
  name: String,
  directory: String,
  enabled_claude: bool,
  enabled_codex: bool,
  installed_at: i64,
  updated_at: i64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CcSwitchSqliteSkillRow {
  id: String,
  name: String,
  directory: String,
  enabled_claude: i64,
  enabled_codex: i64,
  installed_at: i64,
  updated_at: i64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CcSwitchSqliteSnapshot {
  available: bool,
  db_path: String,
  skills_count: i64,
  enabled_claude_count: i64,
  enabled_codex_count: i64,
  latest_skill_updated_at: Option<i64>,
  sample_skills: Vec<CcSwitchSqliteSkill>,
  error: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CcSwitchSqliteStatsRow {
  skills_count: i64,
  enabled_claude_count: i64,
  enabled_codex_count: i64,
  latest_skill_updated_at: Option<i64>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CcSwitchProvider {
  id: String,
  app_type: String,
  name: String,
  is_current: bool,
  has_status_line: bool,
  status_line_command: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CcSwitchProviderRow {
  id: String,
  app_type: String,
  name: String,
  is_current: i64,
  has_status_line: i64,
  status_line_command: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CcSwitchProvidersSnapshot {
  available: bool,
  db_path: String,
  app_type: String,
  providers: Vec<CcSwitchProvider>,
  error: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct InjectStatusLineResult {
  updated_count: u32,
  updated_provider_ids: Vec<String>,
  backup_path: String,
  status_line_command: Option<String>,
}

fn resolve_claude_settings_path(config_dir: &str) -> PathBuf {
  PathBuf::from(config_dir).join("settings.json")
}

fn resolve_claude_installed_plugins_path(config_dir: &str) -> PathBuf {
  PathBuf::from(config_dir)
    .join("plugins")
    .join("installed_plugins.json")
}

fn resolve_ccswitch_settings_path(config_dir: &str) -> PathBuf {
  PathBuf::from(config_dir).join("settings.json")
}

fn resolve_ccswitch_database_path(config_dir: &str) -> PathBuf {
  PathBuf::from(config_dir).join("cc-switch.db")
}

fn unavailable_git_status(repo_dir: &str, error: String) -> GitReadOnlyStatus {
  GitReadOnlyStatus {
    available: false,
    repo_path: repo_dir.to_string(),
    branch: None,
    remote: None,
    ahead: 0,
    behind: 0,
    local_changes: Vec::new(),
    remote_changes: Vec::new(),
    last_read_at: None,
    error: Some(error),
  }
}

fn unavailable_sqlite_snapshot(db_path: &PathBuf, error: String) -> CcSwitchSqliteSnapshot {
  CcSwitchSqliteSnapshot {
    available: false,
    db_path: db_path.display().to_string(),
    skills_count: 0,
    enabled_claude_count: 0,
    enabled_codex_count: 0,
    latest_skill_updated_at: None,
    sample_skills: Vec::new(),
    error: Some(error),
  }
}

fn unavailable_providers_snapshot(
  db_path: &PathBuf,
  app_type: &str,
  error: String,
) -> CcSwitchProvidersSnapshot {
  CcSwitchProvidersSnapshot {
    available: false,
    db_path: db_path.display().to_string(),
    app_type: app_type.to_string(),
    providers: Vec::new(),
    error: Some(error),
  }
}

fn is_supported_cc_switch_app_type(app_type: &str) -> bool {
  matches!(app_type, "claude" | "codex" | "gemini" | "opencode" | "hermes")
}

fn is_cc_switch_process_running() -> bool {
  #[cfg(target_os = "windows")]
  {
    let snapshot = unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) };
    if snapshot == INVALID_HANDLE_VALUE {
      return false;
    }

    let mut entry = PROCESSENTRY32W {
      dwSize: std::mem::size_of::<PROCESSENTRY32W>() as u32,
      ..unsafe { std::mem::zeroed() }
    };

    let mut found = false;
    let first_ok = unsafe { Process32FirstW(snapshot, &mut entry) } != 0;
    if first_ok {
      loop {
        let exe_name_len = entry
          .szExeFile
          .iter()
          .position(|&ch| ch == 0)
          .unwrap_or(entry.szExeFile.len());
        let exe_name = String::from_utf16_lossy(&entry.szExeFile[..exe_name_len]).to_lowercase();
        if exe_name == "cc-switch.exe" {
          found = true;
          break;
        }

        if unsafe { Process32NextW(snapshot, &mut entry) } == 0 {
          break;
        }
      }
    }

    let _ = unsafe { CloseHandle(snapshot) };
    found
  }
  #[cfg(not(target_os = "windows"))]
  {
    false
  }
}

fn backup_ccswitch_database(ccswitch_config_dir: &str) -> Result<PathBuf, String> {
  let db_path = resolve_ccswitch_database_path(ccswitch_config_dir);
  if !db_path.exists() {
    return Err(format!(
      "cc-switch database file does not exist: {}",
      db_path.display()
    ));
  }
  let timestamp = SystemTime::now()
    .duration_since(UNIX_EPOCH)
    .map(|d| d.as_secs())
    .unwrap_or(0);
  let backup_path = db_path.with_file_name(format!("cc-switch.db.bak-{timestamp}"));
  fs::copy(&db_path, &backup_path)
    .map_err(|err| format!("Failed to back up DB to {}: {err}", backup_path.display()))?;
  Ok(backup_path)
}

fn run_git(repo_dir: &PathBuf, args: &[&str]) -> Result<String, String> {
  let output = Command::new("git")
    .args(args)
    .current_dir(repo_dir)
    .output()
    .map_err(|err| format!("Failed to run git: {err}"))?;

  let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
  let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();

  if !output.status.success() {
    return Err(if stderr.is_empty() {
      stdout
    } else {
      stderr
    });
  }

  Ok(stdout)
}

fn open_ccswitch_readonly_connection(db_path: &PathBuf) -> Result<rusqlite::Connection, String> {
  let conn = rusqlite::Connection::open_with_flags(
    db_path,
    rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY | rusqlite::OpenFlags::SQLITE_OPEN_NO_MUTEX,
  )
  .map_err(|err| format!("Failed to open cc-switch DB read-only: {err}"))?;

  conn
    .busy_timeout(Duration::from_millis(500))
    .map_err(|err| format!("Failed to configure cc-switch DB timeout: {err}"))?;

  Ok(conn)
}

fn open_ccswitch_write_connection(db_path: &PathBuf) -> Result<rusqlite::Connection, String> {
  let conn = rusqlite::Connection::open(db_path)
    .map_err(|err| format!("Failed to open cc-switch DB: {err}"))?;

  conn
    .busy_timeout(Duration::from_millis(1000))
    .map_err(|err| format!("Failed to configure cc-switch DB timeout: {err}"))?;

  Ok(conn)
}

fn parse_git_local_changes(status_output: &str) -> Vec<GitChangePreview> {
  status_output
    .lines()
    .enumerate()
    .filter_map(|(index, line)| {
      if line.len() < 4 {
        return None;
      }
      let status_code = line[..2].trim();
      let raw_path = line[3..].trim();
      let path = raw_path
        .split(" -> ")
        .last()
        .unwrap_or(raw_path)
        .to_string();
      let summary = match status_code {
        "M" => "Modified",
        "A" => "Added",
        "D" => "Deleted",
        "R" => "Renamed",
        "C" => "Copied",
        "??" => "Untracked",
        _ => "Changed",
      };
      Some(GitChangePreview {
        id: format!("git-local-{index}"),
        path,
        summary: summary.to_string(),
        timestamp: String::new(),
      })
    })
    .collect()
}

fn parse_git_remote_changes(log_output: &str) -> Vec<GitChangePreview> {
  log_output
    .lines()
    .filter_map(|line| {
      let mut parts = line.split('\u{1f}');
      let hash = parts.next()?;
      let subject = parts.next()?;
      let timestamp = parts.next().unwrap_or_default();
      Some(GitChangePreview {
        id: format!("git-remote-{hash}"),
        path: "@{upstream}".to_string(),
        summary: subject.to_string(),
        timestamp: timestamp.to_string(),
      })
    })
    .collect()
}

fn read_json_or_default(path: &PathBuf, default_value: Value) -> Result<Value, String> {
  if !path.exists() {
    return Ok(default_value);
  }

  let content = fs::read_to_string(path)
    .map_err(|err| format!("Failed to read json file {}: {err}", path.display()))?;
  serde_json::from_str::<Value>(&content)
    .map_err(|err| format!("Failed to parse json file {}: {err}", path.display()))
}

fn write_json(path: &PathBuf, value: &Value) -> Result<(), String> {
  let serialized = serde_json::to_string_pretty(value)
    .map_err(|err| format!("Failed to serialize json for {}: {err}", path.display()))?;

  if let Some(parent_dir) = path.parent() {
    fs::create_dir_all(parent_dir).map_err(|err| {
      format!(
        "Failed to create parent directory for {}: {err}",
        path.display()
      )
    })?;
  }

  fs::write(path, format!("{serialized}\n"))
    .map_err(|err| format!("Failed to write json file {}: {err}", path.display()))
}

fn parse_claude_installed_plugins(installed_plugins_json: &Value) -> Vec<ClaudeInstalledPlugin> {
  let mut installed_plugins = Vec::new();

  if let Some(plugins_obj) = installed_plugins_json
    .get("plugins")
    .and_then(|value| value.as_object())
  {
    for (plugin_key, plugin_versions) in plugins_obj {
      let version = plugin_versions
        .as_array()
        .and_then(|entries| entries.first())
        .and_then(|entry| entry.get("version"))
        .and_then(|value| value.as_str())
        .unwrap_or("unknown");

      installed_plugins.push(ClaudeInstalledPlugin {
        key: plugin_key.to_string(),
        version: version.to_string(),
      });
    }
  }

  installed_plugins.sort_by(|left, right| left.key.cmp(&right.key));
  installed_plugins
}

fn parse_enabled_plugins(settings_json: &Value) -> HashMap<String, bool> {
  let mut enabled_plugins = HashMap::new();
  if let Some(enabled_obj) = settings_json
    .get("enabledPlugins")
    .and_then(|value| value.as_object())
  {
    for (plugin_key, enabled_value) in enabled_obj {
      enabled_plugins.insert(plugin_key.to_string(), enabled_value.as_bool().unwrap_or(false));
    }
  }
  enabled_plugins
}

fn parse_plugin_configs(settings_json: &Value) -> HashMap<String, Value> {
  let mut plugin_configs = HashMap::new();
  if let Some(config_obj) = settings_json
    .get("pluginConfigs")
    .and_then(|value| value.as_object())
  {
    for (plugin_key, config_value) in config_obj {
      plugin_configs.insert(plugin_key.to_string(), config_value.clone());
    }
  }
  plugin_configs
}

fn read_claude_settings_json(config_dir: &str) -> Result<Value, String> {
  let settings_path = resolve_claude_settings_path(config_dir);
  read_json_or_default(&settings_path, Value::Object(Map::new()))
}

fn write_claude_settings_json(config_dir: &str, settings_json: &Value) -> Result<(), String> {
  let settings_path = resolve_claude_settings_path(config_dir);
  write_json(&settings_path, settings_json)
}

fn read_ccswitch_settings_json(config_dir: &str) -> Result<(bool, Value), String> {
  let settings_path = resolve_ccswitch_settings_path(config_dir);
  if !settings_path.exists() {
    return Ok((false, Value::Object(Map::new())));
  }
  let settings_json = read_json_or_default(&settings_path, Value::Object(Map::new()))?;
  Ok((true, settings_json))
}

fn write_ccswitch_settings_json(config_dir: &str, settings_json: &Value) -> Result<(), String> {
  let settings_path = resolve_ccswitch_settings_path(config_dir);
  write_json(&settings_path, settings_json)
}

#[tauri::command]
fn superpowers_source_root() -> Result<PathBuf, String> {
  let profile = std::env::var("USERPROFILE")
    .map_err(|_| "USERPROFILE environment variable not set".to_string())?;
  Ok(PathBuf::from(profile).join(".codex").join("superpowers").join("skills"))
}

fn superpowers_visible_root() -> Result<PathBuf, String> {
  let profile = std::env::var("USERPROFILE")
    .map_err(|_| "USERPROFILE environment variable not set".to_string())?;
  Ok(PathBuf::from(profile).join(".agents").join("skills").join("superpowers"))
}

fn superpowers_agents_md() -> Result<PathBuf, String> {
  let profile = std::env::var("USERPROFILE")
    .map_err(|_| "USERPROFILE environment variable not set".to_string())?;
  Ok(PathBuf::from(profile).join(".codex").join("AGENTS.md"))
}

fn list_dir_names(path: &PathBuf) -> Vec<String> {
  if !path.exists() {
    return Vec::new();
  }
  let mut names: Vec<String> = fs::read_dir(path)
    .into_iter()
    .flatten()
    .flatten()
    .filter(|entry| {
      entry
        .file_type()
        .map(|ft| ft.is_dir() || ft.is_symlink())
        .unwrap_or(false)
    })
    .filter_map(|entry| entry.file_name().into_string().ok())
    .collect();
  names.sort();
  names
}

fn create_junction(link: &PathBuf, target: &PathBuf) -> Result<(), String> {
  let output = Command::new("cmd")
    .args([
      "/c",
      "mklink",
      "/J",
      &link.to_string_lossy(),
      &target.to_string_lossy(),
    ])
    .output()
    .map_err(|err| format!("Failed to create junction: {err}"))?;

  if !output.status.success() {
    let stderr = String::from_utf8_lossy(&output.stderr);
    let stdout = String::from_utf8_lossy(&output.stdout);
    return Err(format!("mklink /J failed: {stderr} {stdout}"));
  }
  Ok(())
}

const MANAGED_BLOCK_START: &str = "<!-- BEGIN MANAGED SUPERPOWERS -->";
const MANAGED_BLOCK_END: &str = "<!-- END MANAGED SUPERPOWERS -->";

fn build_managed_block(enabled_skills: &[String]) -> String {
  let mut lines = vec![
    MANAGED_BLOCK_START.to_string(),
    "## Superpowers Whitelist".to_string(),
    String::new(),
  ];

  if enabled_skills.is_empty() {
    lines.push("No superpowers skills are currently enabled.".to_string());
  } else {
    lines.push("Only the following superpowers skills are enabled:".to_string());
    lines.push(String::new());
    for skill in enabled_skills {
      lines.push(format!("- `{skill}`"));
    }
    lines.push(String::new());
    lines.push(
      "Do not use any other skill from the installed `superpowers` library unless the user explicitly changes this whitelist.".to_string(),
    );
  }

  lines.push(MANAGED_BLOCK_END.to_string());
  lines.join("\n")
}

fn update_agents_md(agents_md: &PathBuf, enabled_skills: &[String]) -> Result<(), String> {
  let managed_block = build_managed_block(enabled_skills);

  if !agents_md.exists() {
    let content = format!(
      "# Personal Codex Rules\n\nThis file applies to your home-level Codex environment.\n\n{managed_block}\n"
    );
    fs::write(agents_md, content)
      .map_err(|err| format!("Failed to create AGENTS.md: {err}"))?;
    return Ok(());
  }

  let existing = fs::read_to_string(agents_md)
    .map_err(|err| format!("Failed to read AGENTS.md: {err}"))?;

  let updated = if let (Some(start), Some(end)) = (
    existing.find(MANAGED_BLOCK_START),
    existing.find(MANAGED_BLOCK_END),
  ) {
    let after_end = end + MANAGED_BLOCK_END.len();
    format!(
      "{}{}{}",
      &existing[..start],
      managed_block,
      &existing[after_end..]
    )
  } else {
    format!("{existing}\n{managed_block}\n")
  };

  fs::write(agents_md, updated)
    .map_err(|err| format!("Failed to write AGENTS.md: {err}"))
}

fn sync_visible_skills(
  source_root: &PathBuf,
  visible_root: &PathBuf,
  enabled_skills: &[String],
) -> Result<(), String> {
  fs::create_dir_all(visible_root)
    .map_err(|err| format!("Failed to create visible root: {err}"))?;

  let enabled_set: HashSet<&str> = enabled_skills.iter().map(String::as_str).collect();
  let current = list_dir_names(visible_root);

  for name in &current {
    if !enabled_set.contains(name.as_str()) {
      let path = visible_root.join(name);
      fs::remove_dir_all(&path)
        .map_err(|err| format!("Failed to remove {name}: {err}"))?;
    }
  }

  let current_set: HashSet<String> = current.into_iter().collect();
  for name in enabled_skills {
    if !current_set.contains(name) {
      let link = visible_root.join(name);
      let target = source_root.join(name);
      if !target.exists() {
        return Err(format!("Missing source skill: {}", target.display()));
      }
      create_junction(&link, &target)?;
    }
  }

  Ok(())
}

#[tauri::command]
fn codex_list_superpowers(_scripts_dir: String) -> Result<Vec<SuperpowerSkill>, String> {
  let source_root = superpowers_source_root()?;
  let visible_root = superpowers_visible_root()?;

  let available = list_dir_names(&source_root);
  let enabled_set: HashSet<String> = list_dir_names(&visible_root).into_iter().collect();

  Ok(
    available
      .into_iter()
      .map(|name| {
        let enabled = enabled_set.contains(&name);
        SuperpowerSkill { name, enabled }
      })
      .collect(),
  )
}

#[tauri::command]
fn codex_set_superpowers_enabled(
  _scripts_dir: String,
  enabled_skills: Vec<String>,
) -> Result<String, String> {
  let source_root = superpowers_source_root()?;
  let visible_root = superpowers_visible_root()?;
  let agents_md = superpowers_agents_md()?;

  let normalized: Vec<String> = enabled_skills
    .iter()
    .map(|s| s.trim().to_string())
    .filter(|s| !s.is_empty())
    .collect();

  sync_visible_skills(&source_root, &visible_root, &normalized)?;
  update_agents_md(&agents_md, &normalized)?;

  if normalized.is_empty() {
    Ok("Saved enabled skills: (none)".to_string())
  } else {
    Ok(format!("Saved enabled skills: {}", normalized.join(", ")))
  }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct CodexInstalledPlugin {
  plugin_id: String,
  display_name: String,
  marketplace: String,
  version: String,
  enabled: bool,
}

fn codex_config_path() -> Result<PathBuf, String> {
  let profile = std::env::var("USERPROFILE")
    .map_err(|_| "USERPROFILE environment variable not set".to_string())?;
  Ok(PathBuf::from(profile).join(".codex").join("config.toml"))
}

fn parse_codex_config_plugins(config_path: &PathBuf) -> Result<Vec<CodexInstalledPlugin>, String> {
  if !config_path.exists() {
    return Ok(Vec::new());
  }
  let content = fs::read_to_string(config_path)
    .map_err(|err| format!("Failed to read codex config: {err}"))?;
  let doc: toml::Value = toml::from_str(&content)
    .map_err(|err| format!("Failed to parse codex config.toml: {err}"))?;

  let mut plugins: Vec<CodexInstalledPlugin> = Vec::new();

  // Parse [plugins."<name>@<marketplace>"] sections
  if let Some(table) = doc.get("plugins").and_then(|v| v.as_table()) {
    for (key, value) in table {
      // key is like "agentmemory@agentmemory"
      let parts: Vec<&str> = key.splitn(2, '@').collect();
      let plugin_id = parts.first().unwrap_or(&key.as_str()).to_string();
      let marketplace = parts.get(1).unwrap_or(&"unknown").to_string();
      let enabled = value
        .get("enabled")
        .and_then(|v| v.as_bool())
        .unwrap_or(true);

      // Try to find installed version from cache
      let version = find_cached_plugin_version(&plugin_id, &marketplace);

      let display_name = plugin_id
        .split(&['-', '_'][..])
        .map(|part| {
          let mut chars = part.chars();
          match chars.next() {
            Some(first) => format!("{}{}", first.to_uppercase(), chars.as_str()),
            None => String::new(),
          }
        })
        .collect::<Vec<_>>()
        .join(" ");

      plugins.push(CodexInstalledPlugin {
        plugin_id,
        display_name,
        marketplace,
        version,
        enabled,
      });
    }
  }

  // Parse [mcp_servers.<name>] sections — treat as plugins too
  if let Some(table) = doc.get("mcp_servers").and_then(|v| v.as_table()) {
    let plugin_ids: HashSet<String> = plugins.iter().map(|p| p.plugin_id.clone()).collect();
    for (name, _value) in table {
      // Skip if already registered as a plugin
      if plugin_ids.contains(name.as_str()) {
        continue;
      }
      let display_name = name
        .split(&['-', '_'][..])
        .map(|part| {
          let mut chars = part.chars();
          match chars.next() {
            Some(first) => format!("{}{}", first.to_uppercase(), chars.as_str()),
            None => String::new(),
          }
        })
        .collect::<Vec<_>>()
        .join(" ");
      // Scan all cache marketplaces for this plugin
      let version = find_cached_version_any_marketplace(name);
      plugins.push(CodexInstalledPlugin {
        plugin_id: name.clone(),
        display_name,
        marketplace: "mcp".to_string(),
        version,
        enabled: true,
      });
    }
  }

  Ok(plugins)
}

fn find_cached_plugin_version(plugin_id: &str, marketplace: &str) -> String {
  let profile = match std::env::var("USERPROFILE") {
    Ok(p) => p,
    Err(_) => return "unknown".to_string(),
  };
  let plugin_dir = PathBuf::from(&profile)
    .join(".codex")
    .join("plugins")
    .join("cache")
    .join(marketplace)
    .join(plugin_id);

  if !plugin_dir.exists() {
    return "unknown".to_string();
  }

  // Find the latest version directory (highest semver or most recent)
  let mut versions: Vec<String> = Vec::new();
  if let Ok(entries) = fs::read_dir(&plugin_dir) {
    for entry in entries.flatten() {
      let name = entry.file_name().to_string_lossy().to_string();
      if entry.path().is_dir() && !name.starts_with('.') && name != "latest" {
        versions.push(name);
      }
    }
  }

  versions.sort();
  versions.last().cloned().unwrap_or_else(|| "unknown".to_string())
}

fn find_cached_version_any_marketplace(plugin_id: &str) -> String {
  let profile = match std::env::var("USERPROFILE") {
    Ok(p) => p,
    Err(_) => return "unknown".to_string(),
  };
  let cache_root = PathBuf::from(&profile)
    .join(".codex")
    .join("plugins")
    .join("cache");

  if !cache_root.exists() {
    return "unknown".to_string();
  }

  // Scan all marketplace directories for this plugin
  if let Ok(marketplaces) = fs::read_dir(&cache_root) {
    for marketplace_entry in marketplaces.flatten() {
      if !marketplace_entry.path().is_dir() {
        continue;
      }
      let mname = marketplace_entry.file_name().to_string_lossy().to_string();
      if mname.starts_with('.') || mname.contains("backup") {
        continue;
      }
      let plugin_dir = marketplace_entry.path().join(plugin_id);
      if plugin_dir.exists() {
        let mut versions: Vec<String> = Vec::new();
        if let Ok(entries) = fs::read_dir(&plugin_dir) {
          for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if entry.path().is_dir() && !name.starts_with('.') && name != "latest" {
              versions.push(name);
            }
          }
        }
        versions.sort();
        if let Some(v) = versions.last() {
          return v.clone();
        }
      }
    }
  }

  "unknown".to_string()
}

#[tauri::command]
fn codex_read_installed_plugins() -> Result<Vec<CodexInstalledPlugin>, String> {
  let mut plugins: Vec<CodexInstalledPlugin> = Vec::new();

  // Always check if superpowers is installed (it's managed separately)
  let source_root = superpowers_source_root()?;
  if source_root.exists() {
    let version = find_cached_plugin_version("superpowers", "claude-plugins-official");
    plugins.push(CodexInstalledPlugin {
      plugin_id: "superpowers".to_string(),
      display_name: "Codex Superpowers".to_string(),
      marketplace: "claude-plugins-official".to_string(),
      version,
      enabled: true,
    });
  }

  // Parse config.toml for other installed plugins
  let config_path = codex_config_path()?;
  if let Ok(config_plugins) = parse_codex_config_plugins(&config_path) {
    for plugin in config_plugins {
      // Skip superpowers since we already added it
      if plugin.plugin_id == "superpowers" {
        continue;
      }
      plugins.push(plugin);
    }
  }

  plugins.sort_by(|a, b| a.plugin_id.cmp(&b.plugin_id));
  Ok(plugins)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct HermesMcpServer {
  name: String,
  command: String,
  args: Vec<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct HermesRuntimeState {
  mcp_servers: Vec<HermesMcpServer>,
  skills_count: u32,
  enabled_skills_count: u32,
}

#[tauri::command]
fn hermes_read_runtime(
  hermes_config_dir: String,
  hermes_skills_dir: String,
) -> Result<HermesRuntimeState, String> {
  let config_path = PathBuf::from(&hermes_config_dir).join("config.yaml");
  let mut mcp_servers: Vec<HermesMcpServer> = Vec::new();

  if config_path.exists() {
    let content = fs::read_to_string(&config_path)
      .map_err(|err| format!("Failed to read Hermes config: {err}"))?;
    let doc: toml::Value = toml::from_str(&content)
      .map_err(|err| format!("Failed to parse Hermes config.yaml: {err}"))?;

    if let Some(table) = doc.get("mcp_servers").and_then(|v| v.as_table()) {
      for (name, value) in table {
        let command = value
          .get("command")
          .and_then(|v| v.as_str())
          .unwrap_or("")
          .to_string();
        let args = value
          .get("args")
          .and_then(|v| v.as_array())
          .map(|arr| {
            arr
              .iter()
              .filter_map(|v| v.as_str().map(String::from))
              .collect()
          })
          .unwrap_or_default();
        mcp_servers.push(HermesMcpServer {
          name: name.clone(),
          command,
          args,
        });
      }
    }
  }

  // Count skills
  let skills_root = PathBuf::from(&hermes_skills_dir);
  let mut skills_count: u32 = 0;
  let mut enabled_skills_count: u32 = 0;

  if skills_root.exists() {
    if let Ok(categories) = fs::read_dir(&skills_root) {
      for cat_entry in categories.flatten() {
        let cat_path = cat_entry.path();
        if cat_path.is_dir() {
          if let Ok(skills) = fs::read_dir(&cat_path) {
            for skill_entry in skills.flatten() {
              let skill_path = skill_entry.path();
              if skill_path.is_dir() && skill_path.join("SKILL.md").exists() {
                skills_count += 1;
                enabled_skills_count += 1;
              }
            }
          }
        }
      }
    }
  }

  Ok(HermesRuntimeState {
    mcp_servers,
    skills_count,
    enabled_skills_count,
  })
}

#[tauri::command]
fn claude_read_runtime(claude_config_dir: String) -> Result<ClaudeRuntimeState, String> {
  let installed_plugins_path = resolve_claude_installed_plugins_path(&claude_config_dir);
  let installed_plugins_json = read_json_or_default(
    &installed_plugins_path,
    serde_json::json!({
      "plugins": {}
    }),
  )?;
  let settings_json = read_claude_settings_json(&claude_config_dir)?;

  Ok(ClaudeRuntimeState {
    installed_plugins: parse_claude_installed_plugins(&installed_plugins_json),
    enabled_plugins: parse_enabled_plugins(&settings_json),
    plugin_configs: parse_plugin_configs(&settings_json),
  })
}

#[tauri::command]
fn claude_set_enabled_plugin(
  claude_config_dir: String,
  plugin_key: String,
  enabled: bool,
) -> Result<String, String> {
  if plugin_key.trim().is_empty() {
    return Err("plugin_key is required".to_string());
  }

  let mut settings_json = read_claude_settings_json(&claude_config_dir)?;
  let settings_obj = settings_json
    .as_object_mut()
    .ok_or_else(|| "settings.json root must be a JSON object".to_string())?;

  let enabled_plugins_obj = settings_obj
    .entry("enabledPlugins".to_string())
    .or_insert_with(|| Value::Object(Map::new()));

  let enabled_plugins_map = enabled_plugins_obj
    .as_object_mut()
    .ok_or_else(|| "enabledPlugins must be a JSON object".to_string())?;

  enabled_plugins_map.insert(plugin_key.clone(), Value::Bool(enabled));
  write_claude_settings_json(&claude_config_dir, &settings_json)?;

  Ok(format!(
    "Set enabledPlugins.{}={}",
    plugin_key,
    if enabled { "true" } else { "false" }
  ))
}

#[tauri::command]
fn claude_set_plugin_config(
  claude_config_dir: String,
  plugin_key: String,
  config: Value,
) -> Result<String, String> {
  if plugin_key.trim().is_empty() {
    return Err("plugin_key is required".to_string());
  }

  let mut settings_json = read_claude_settings_json(&claude_config_dir)?;
  let settings_obj = settings_json
    .as_object_mut()
    .ok_or_else(|| "settings.json root must be a JSON object".to_string())?;

  let plugin_configs_obj = settings_obj
    .entry("pluginConfigs".to_string())
    .or_insert_with(|| Value::Object(Map::new()));

  let plugin_configs_map = plugin_configs_obj
    .as_object_mut()
    .ok_or_else(|| "pluginConfigs must be a JSON object".to_string())?;

  plugin_configs_map.insert(plugin_key.clone(), config);
  write_claude_settings_json(&claude_config_dir, &settings_json)?;

  Ok(format!("Updated pluginConfigs.{}", plugin_key))
}

#[tauri::command]
fn orchestrator_read_state(config_dir: String) -> Result<Value, String> {
  let state_path = PathBuf::from(&config_dir).join("ai-orchestrator-state.json");
  read_json_or_default(&state_path, Value::Null)
}

#[tauri::command]
fn orchestrator_write_state(config_dir: String, state: Value) -> Result<String, String> {
  let state_path = PathBuf::from(&config_dir).join("ai-orchestrator-state.json");
  write_json(&state_path, &state)?;
  Ok("Saved orchestrator state".to_string())
}

#[tauri::command]
fn path_exists(path: String) -> bool {
  PathBuf::from(path).exists()
}

#[tauri::command]
fn ccswitch_read_runtime(ccswitch_config_dir: String) -> Result<CcSwitchRuntimeState, String> {
  let (exists, settings) = read_ccswitch_settings_json(&ccswitch_config_dir)?;
  Ok(CcSwitchRuntimeState { exists, settings })
}

#[tauri::command]
fn git_read_status(repo_dir: String) -> Result<GitReadOnlyStatus, String> {
  let repo_path = PathBuf::from(&repo_dir);
  if !repo_path.exists() {
    return Ok(unavailable_git_status(
      &repo_dir,
      "Configured Git repo path does not exist".to_string(),
    ));
  }

  if !repo_path.join(".git").exists() {
    return Ok(unavailable_git_status(
      &repo_dir,
      "Configured path is not a Git worktree".to_string(),
    ));
  }

  let branch = run_git(&repo_path, &["branch", "--show-current"]).ok();
  let remote = run_git(&repo_path, &["remote", "get-url", "origin"]).ok();
  let local_changes = run_git(&repo_path, &["status", "--porcelain=v1"])
    .map(|output| parse_git_local_changes(&output))
    .unwrap_or_default();

  let (ahead, behind) =
    match run_git(&repo_path, &["rev-list", "--left-right", "--count", "HEAD...@{upstream}"]) {
      Ok(output) => {
        let mut parts = output.split_whitespace();
        let ahead = parts
          .next()
          .and_then(|value| value.parse::<u32>().ok())
          .unwrap_or(0);
        let behind = parts
          .next()
          .and_then(|value| value.parse::<u32>().ok())
          .unwrap_or(0);
        (ahead, behind)
      }
      Err(_) => (0, 0),
    };

  let remote_changes = if behind > 0 {
    run_git(
      &repo_path,
      &["log", "--format=%H%x1f%s%x1f%cI", "-n", "8", "HEAD..@{upstream}"],
    )
    .map(|output| parse_git_remote_changes(&output))
    .unwrap_or_default()
  } else {
    Vec::new()
  };

  Ok(GitReadOnlyStatus {
    available: true,
    repo_path: repo_dir,
    branch,
    remote,
    ahead,
    behind,
    local_changes,
    remote_changes,
    last_read_at: None,
    error: None,
  })
}

#[tauri::command]
fn ccswitch_read_lifecycle(
  ccswitch_config_dir: String,
) -> Result<CcSwitchSqliteSnapshot, String> {
  let db_path = resolve_ccswitch_database_path(&ccswitch_config_dir);
  if !db_path.exists() {
    return Ok(unavailable_sqlite_snapshot(
      &db_path,
      "cc-switch database file does not exist".to_string(),
    ));
  }

  let conn = match open_ccswitch_readonly_connection(&db_path) {
    Ok(conn) => conn,
    Err(error) => {
      return Ok(unavailable_sqlite_snapshot(&db_path, error));
    }
  };

  let stats_query = "
    select
      (select count(*) from skills) as skillsCount,
      (select count(*) from skills where enabled_claude != 0) as enabledClaudeCount,
      (select count(*) from skills where enabled_codex != 0) as enabledCodexCount,
      (select max(updated_at) from skills) as latestSkillUpdatedAt
  ";

  let stats = match conn.query_row(stats_query, [], |row| {
    Ok(CcSwitchSqliteStatsRow {
      skills_count: row.get(0)?,
      enabled_claude_count: row.get(1)?,
      enabled_codex_count: row.get(2)?,
      latest_skill_updated_at: row.get(3)?,
    })
  }) {
    Ok(stats) => stats,
    Err(error) => {
      return Ok(unavailable_sqlite_snapshot(
        &db_path,
        format!("Failed to query cc-switch skill stats: {error}"),
      ));
    }
  };

  let sample_query = "
    select
      id,
      name,
      directory,
      coalesce(enabled_claude, 0) as enabledClaude,
      coalesce(enabled_codex, 0) as enabledCodex,
      coalesce(installed_at, 0) as installedAt,
      coalesce(updated_at, 0) as updatedAt
    from skills
    order by updated_at desc, name asc
    limit 8
  ";

  let mut sample_stmt = match conn.prepare(sample_query) {
    Ok(stmt) => stmt,
    Err(error) => {
      return Ok(unavailable_sqlite_snapshot(
        &db_path,
        format!("Failed to prepare cc-switch sample query: {error}"),
      ));
    }
  };

  let sample_rows = match sample_stmt.query_map([], |row| {
    Ok(CcSwitchSqliteSkillRow {
      id: row.get(0)?,
      name: row.get(1)?,
      directory: row.get(2)?,
      enabled_claude: row.get(3)?,
      enabled_codex: row.get(4)?,
      installed_at: row.get(5)?,
      updated_at: row.get(6)?,
    })
  }) {
    Ok(rows) => rows,
    Err(error) => {
      return Ok(unavailable_sqlite_snapshot(
        &db_path,
        format!("Failed to query cc-switch sample rows: {error}"),
      ));
    }
  };

  let sample_skills = match sample_rows.collect::<Result<Vec<_>, _>>() {
    Ok(rows) => rows
      .into_iter()
      .map(|row| CcSwitchSqliteSkill {
        id: row.id,
        name: row.name,
        directory: row.directory,
        enabled_claude: row.enabled_claude != 0,
        enabled_codex: row.enabled_codex != 0,
        installed_at: row.installed_at,
        updated_at: row.updated_at,
      })
      .collect(),
    Err(error) => {
      return Ok(unavailable_sqlite_snapshot(
        &db_path,
        format!("Failed to collect cc-switch sample rows: {error}"),
      ));
    }
  };

  Ok(CcSwitchSqliteSnapshot {
    available: true,
    db_path: db_path.display().to_string(),
    skills_count: stats.skills_count,
    enabled_claude_count: stats.enabled_claude_count,
    enabled_codex_count: stats.enabled_codex_count,
    latest_skill_updated_at: stats.latest_skill_updated_at,
    sample_skills,
    error: None,
  })
}

#[tauri::command]
fn ccswitch_list_providers(
  ccswitch_config_dir: String,
  app_type_filter: Option<String>,
) -> Result<CcSwitchProvidersSnapshot, String> {
  let db_path = resolve_ccswitch_database_path(&ccswitch_config_dir);
  let requested_app_type = app_type_filter
    .as_deref()
    .map(str::trim)
    .filter(|value| !value.is_empty())
    .unwrap_or("claude")
    .to_string();

  if !db_path.exists() {
    return Ok(unavailable_providers_snapshot(
      &db_path,
      &requested_app_type,
      "cc-switch database file does not exist".to_string(),
    ));
  }

  if !is_supported_cc_switch_app_type(&requested_app_type) {
    return Ok(unavailable_providers_snapshot(
      &db_path,
      &requested_app_type,
      format!("Unsupported app_type: {requested_app_type}"),
    ));
  }

  let conn = match open_ccswitch_readonly_connection(&db_path) {
    Ok(conn) => conn,
    Err(error) => {
      return Ok(unavailable_providers_snapshot(
        &db_path,
        &requested_app_type,
        error,
      ));
    }
  };

  let query = "
    select
      id,
      app_type as appType,
      name,
      case when is_current != 0 then 1 else 0 end as isCurrent,
      case when json_extract(settings_config, '$.statusLine') is null then 0 else 1 end as hasStatusLine,
      coalesce(json_extract(settings_config, '$.statusLine.command'), '') as statusLineCommand
    from providers
    where app_type = ?1
    order by name
  ";

  let mut stmt = match conn.prepare(query) {
    Ok(stmt) => stmt,
    Err(error) => {
      return Ok(unavailable_providers_snapshot(
        &db_path,
        &requested_app_type,
        format!("Failed to prepare cc-switch providers query: {error}"),
      ));
    }
  };

  let mapped_rows = match stmt.query_map([requested_app_type.as_str()], |row| {
    Ok(CcSwitchProviderRow {
      id: row.get(0)?,
      app_type: row.get(1)?,
      name: row.get(2)?,
      is_current: row.get(3)?,
      has_status_line: row.get(4)?,
      status_line_command: row.get(5)?,
    })
  }) {
    Ok(rows) => rows,
    Err(error) => {
      return Ok(unavailable_providers_snapshot(
        &db_path,
        &requested_app_type,
        format!("Failed to query cc-switch providers: {error}"),
      ));
    }
  };

  let rows = match mapped_rows.collect::<Result<Vec<_>, _>>() {
    Ok(rows) => rows,
    Err(error) => {
      return Ok(unavailable_providers_snapshot(
        &db_path,
        &requested_app_type,
        format!("Failed to collect cc-switch providers: {error}"),
      ));
    }
  };

  let providers = rows
    .into_iter()
    .map(|row| CcSwitchProvider {
      id: row.id,
      app_type: row.app_type,
      name: row.name,
      is_current: row.is_current != 0,
      has_status_line: row.has_status_line != 0,
      status_line_command: row.status_line_command,
    })
    .collect();

  Ok(CcSwitchProvidersSnapshot {
    available: true,
    db_path: db_path.display().to_string(),
    app_type: requested_app_type,
    providers,
    error: None,
  })
}

#[tauri::command]
fn ccswitch_process_running() -> bool {
  is_cc_switch_process_running()
}

#[tauri::command]
fn ccswitch_backup_database(ccswitch_config_dir: String) -> Result<String, String> {
  backup_ccswitch_database(&ccswitch_config_dir).map(|path| path.display().to_string())
}

#[tauri::command]
fn ccswitch_inject_status_line(
  ccswitch_config_dir: String,
  app_type: String,
  status_line: Value,
) -> Result<InjectStatusLineResult, String> {
  if is_cc_switch_process_running() {
    return Err(
      "cc-switch is running. Please exit it from the tray (right-click → Quit) before injecting."
        .to_string(),
    );
  }

  if !is_supported_cc_switch_app_type(&app_type) {
    return Err(format!("Unsupported app_type: {app_type}"));
  }

  if !status_line.is_object() {
    return Err("statusLine payload must be a JSON object".to_string());
  }

  let db_path = resolve_ccswitch_database_path(&ccswitch_config_dir);
  if !db_path.exists() {
    return Err(format!(
      "cc-switch database not found: {}",
      db_path.display()
    ));
  }

  let backup_path = backup_ccswitch_database(&ccswitch_config_dir)?;

  let mut conn = open_ccswitch_write_connection(&db_path)?;

  let tx = conn
    .transaction()
    .map_err(|err| format!("Failed to start transaction: {err}"))?;

  let mut stmt = tx
    .prepare("SELECT id, settings_config FROM providers WHERE app_type = ?1")
    .map_err(|err| format!("Failed to prepare select: {err}"))?;
  let mapped_rows = stmt
    .query_map([&app_type], |row| {
      Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    })
    .map_err(|err| format!("Failed to query providers: {err}"))?;
  let rows: Vec<(String, String)> = mapped_rows
    .collect::<Result<Vec<_>, _>>()
    .map_err(|err| format!("Failed to collect provider rows: {err}"))?;
  drop(stmt);

  let mut updated_ids: Vec<String> = Vec::with_capacity(rows.len());
  for (id, settings_config) in rows {
    let mut cfg: Value = serde_json::from_str(&settings_config)
      .map_err(|err| format!("Provider {id} has invalid settings_config JSON: {err}"))?;

    let obj = cfg.as_object_mut().ok_or_else(|| {
      format!("Provider {id} settings_config root must be a JSON object")
    })?;
    obj.insert("statusLine".to_string(), status_line.clone());

    let new_config = serde_json::to_string(&cfg)
      .map_err(|err| format!("Failed to serialize updated config for {id}: {err}"))?;

    tx.execute(
      "UPDATE providers SET settings_config = ?1 WHERE id = ?2 AND app_type = ?3",
      rusqlite::params![new_config, id, app_type],
    )
    .map_err(|err| format!("Failed to update provider {id}: {err}"))?;

    updated_ids.push(id);
  }

  tx.commit()
    .map_err(|err| format!("Failed to commit transaction: {err}"))?;

  let status_line_command = status_line
    .get("command")
    .and_then(|value| value.as_str())
    .map(String::from);

  Ok(InjectStatusLineResult {
    updated_count: updated_ids.len() as u32,
    updated_provider_ids: updated_ids,
    backup_path: backup_path.display().to_string(),
    status_line_command,
  })
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct InjectPluginStateResult {
  updated_count: u32,
  updated_provider_ids: Vec<String>,
  backup_path: String,
  enabled_plugins_count: usize,
  plugin_configs_count: usize,
}

#[tauri::command]
fn ccswitch_inject_plugin_state(
  ccswitch_config_dir: String,
  claude_config_dir: String,
) -> Result<InjectPluginStateResult, String> {
  if is_cc_switch_process_running() {
    return Err(
      "cc-switch is running. Please exit it from the tray (right-click → Quit) before injecting."
        .to_string(),
    );
  }

  // Read current plugin state from Claude settings.json
  let settings_json = read_claude_settings_json(&claude_config_dir)?;
  let enabled_plugins = settings_json
    .get("enabledPlugins")
    .cloned()
    .unwrap_or(Value::Object(Map::new()));
  let plugin_configs = settings_json
    .get("pluginConfigs")
    .cloned()
    .unwrap_or(Value::Object(Map::new()));

  let enabled_plugins_count = enabled_plugins
    .as_object()
    .map(|o| o.len())
    .unwrap_or(0);
  let plugin_configs_count = plugin_configs
    .as_object()
    .map(|o| o.len())
    .unwrap_or(0);

  let db_path = resolve_ccswitch_database_path(&ccswitch_config_dir);
  if !db_path.exists() {
    return Err(format!(
      "cc-switch database not found: {}",
      db_path.display()
    ));
  }

  let backup_path = backup_ccswitch_database(&ccswitch_config_dir)?;
  let mut conn = open_ccswitch_write_connection(&db_path)?;

  let tx = conn
    .transaction()
    .map_err(|err| format!("Failed to start transaction: {err}"))?;

  let mut stmt = tx
    .prepare("SELECT id, settings_config FROM providers WHERE app_type = 'claude'")
    .map_err(|err| format!("Failed to prepare select: {err}"))?;
  let mapped_rows = stmt
    .query_map([], |row| {
      Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    })
    .map_err(|err| format!("Failed to query providers: {err}"))?;
  let rows: Vec<(String, String)> = mapped_rows
    .collect::<Result<Vec<_>, _>>()
    .map_err(|err| format!("Failed to collect provider rows: {err}"))?;
  drop(stmt);

  let mut updated_ids: Vec<String> = Vec::with_capacity(rows.len());
  for (id, settings_config) in rows {
    let mut cfg: Value = serde_json::from_str(&settings_config)
      .map_err(|err| format!("Provider {id} has invalid settings_config JSON: {err}"))?;

    let obj = cfg.as_object_mut().ok_or_else(|| {
      format!("Provider {id} settings_config root must be a JSON object")
    })?;
    obj.insert("enabledPlugins".to_string(), enabled_plugins.clone());
    obj.insert("pluginConfigs".to_string(), plugin_configs.clone());

    let new_config = serde_json::to_string(&cfg)
      .map_err(|err| format!("Failed to serialize updated config for {id}: {err}"))?;

    tx.execute(
      "UPDATE providers SET settings_config = ?1 WHERE id = ?2 AND app_type = 'claude'",
      rusqlite::params![new_config, id],
    )
    .map_err(|err| format!("Failed to update provider {id}: {err}"))?;

    updated_ids.push(id);
  }

  tx.commit()
    .map_err(|err| format!("Failed to commit transaction: {err}"))?;

  Ok(InjectPluginStateResult {
    updated_count: updated_ids.len() as u32,
    updated_provider_ids: updated_ids,
    backup_path: backup_path.display().to_string(),
    enabled_plugins_count,
    plugin_configs_count,
  })
}

#[tauri::command]
fn ccswitch_set_enabled(
  ccswitch_config_dir: String,
  enabled: bool,
) -> Result<String, String> {
  let (_, mut settings_json) = read_ccswitch_settings_json(&ccswitch_config_dir)?;
  let settings_obj = settings_json
    .as_object_mut()
    .ok_or_else(|| "settings.json root must be a JSON object".to_string())?;

  settings_obj.insert(
    "enableClaudePluginIntegration".to_string(),
    Value::Bool(enabled),
  );
  write_ccswitch_settings_json(&ccswitch_config_dir, &settings_json)?;
  Ok(format!(
    "Set enableClaudePluginIntegration={}",
    if enabled { "true" } else { "false" }
  ))
}

#[tauri::command]
fn ccswitch_set_ai_orchestrator_config(
  ccswitch_config_dir: String,
  config: Value,
) -> Result<String, String> {
  if !config.is_object() {
    return Err("config must be a JSON object".to_string());
  }

  let (_, mut settings_json) = read_ccswitch_settings_json(&ccswitch_config_dir)?;
  let settings_obj = settings_json
    .as_object_mut()
    .ok_or_else(|| "settings.json root must be a JSON object".to_string())?;

  settings_obj.insert("aiOrchestrator".to_string(), config);
  write_ccswitch_settings_json(&ccswitch_config_dir, &settings_json)?;
  Ok("Updated aiOrchestrator config".to_string())
}

#[tauri::command]
fn git_write_desired_state(repo_dir: String, state: Value) -> Result<(), String> {
  let repo_path = PathBuf::from(&repo_dir);
  if !repo_path.exists() {
    return Err(format!("Git repo path does not exist: {repo_dir}"));
  }
  let state_path = repo_path.join("desired-state.json");
  write_json(&state_path, &state)
}

#[tauri::command]
fn git_pull(repo_dir: String) -> Result<String, String> {
  let repo_path = PathBuf::from(&repo_dir);
  if !repo_path.exists() {
    return Err(format!("Git repo path does not exist: {repo_dir}"));
  }
  run_git(&repo_path, &["pull", "--ff-only"])
}

#[tauri::command]
fn git_commit_and_push(repo_dir: String, message: String) -> Result<String, String> {
  let repo_path = PathBuf::from(&repo_dir);
  if !repo_path.exists() {
    return Err(format!("Git repo path does not exist: {repo_dir}"));
  }
  let status = run_git(&repo_path, &["status", "--porcelain"])?;
  if status.is_empty() {
    return Ok("Nothing to commit".to_string());
  }
  run_git(&repo_path, &["add", "-A"])?;
  run_git(&repo_path, &["commit", "-m", &message])?;
  run_git(&repo_path, &["push"])
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      codex_list_superpowers,
      codex_set_superpowers_enabled,
      codex_read_installed_plugins,
      claude_read_runtime,
      claude_set_enabled_plugin,
      claude_set_plugin_config,
      orchestrator_read_state,
      orchestrator_write_state,
      git_read_status,
      git_pull,
      git_commit_and_push,
      git_write_desired_state,
      ccswitch_read_runtime,
      ccswitch_read_lifecycle,
      ccswitch_list_providers,
      ccswitch_process_running,
      ccswitch_backup_database,
      ccswitch_inject_status_line,
      ccswitch_inject_plugin_state,
      hermes_read_runtime,
      ccswitch_set_enabled,
      ccswitch_set_ai_orchestrator_config,
      path_exists
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
