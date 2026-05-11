use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::PathBuf;
use std::process::Command;

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

fn run_sqlite_json<T>(db_path: &PathBuf, query: &str) -> Result<Vec<T>, String>
where
  T: for<'de> Deserialize<'de>,
{
  let output = Command::new("sqlite3")
    .arg("-readonly")
    .arg("-json")
    .arg(db_path)
    .arg(query)
    .output()
    .map_err(|err| format!("Failed to run sqlite3: {err}"))?;

  let stdout = String::from_utf8_lossy(&output.stdout).to_string();
  let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();

  if !output.status.success() {
    return Err(if stderr.is_empty() {
      stdout
    } else {
      stderr
    });
  }

  serde_json::from_str::<Vec<T>>(&stdout)
    .map_err(|err| format!("Failed to parse sqlite3 JSON output: {err}"))
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

  let stats_query = "
    select
      (select count(*) from skills) as skillsCount,
      (select count(*) from skills where enabled_claude != 0) as enabledClaudeCount,
      (select count(*) from skills where enabled_codex != 0) as enabledCodexCount,
      (select max(updated_at) from skills) as latestSkillUpdatedAt
  ";

  let stats = match run_sqlite_json::<CcSwitchSqliteStatsRow>(&db_path, stats_query) {
    Ok(rows) => rows.into_iter().next(),
    Err(error) => {
      return Ok(unavailable_sqlite_snapshot(&db_path, error));
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

  let sample_skills = match run_sqlite_json::<CcSwitchSqliteSkillRow>(&db_path, sample_query) {
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
      return Ok(unavailable_sqlite_snapshot(&db_path, error));
    }
  };

  let stats = stats.unwrap_or(CcSwitchSqliteStatsRow {
    skills_count: 0,
    enabled_claude_count: 0,
    enabled_codex_count: 0,
    latest_skill_updated_at: None,
  });

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
      ccswitch_set_enabled,
      ccswitch_set_ai_orchestrator_config,
      path_exists
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
