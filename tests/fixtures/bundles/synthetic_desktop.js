// Synthetic Claude.app desktop-bundle fragment for extractor self-tests.
// Mimics symbols seen in real bundles: kernel env allowlist, secret-unset list,
// host-loop safe set, host-loop excluded built-ins.

// kernel env allowlist (MGn-style)
var MGn = new Set(["HOME","USER","LOGNAME","TERM","LANG","LC_ALL","TZ","PATH",
"CONDA_PREFIX","VIRTUAL_ENV","R_LIBS_USER","R_HOME","PYTHONUNBUFFERED",
"SANDBOX_RUNTIME","TMPDIR","COO_CPUS","PIP_INDEX_URL","UV_INDEX_URL",
"npm_config_registry","HTTP_PROXY","HTTPS_PROXY","http_proxy","https_proxy",
"NO_PROXY","no_proxy","FTP_PROXY","ftp_proxy","OPERON_SECRET_VARS"]);

// secret unset list (ljt-style)
var ljt = ["ANTHROPIC_API_KEY","ANTHROPIC_API_KEY_ENCRYPTION_KEY",
"AWS_SECRET_ACCESS_KEY","AWS_SESSION_TOKEN","CLAUDE_OAUTH_CLIENT_SECRET",
"CORE_API_KEY","DATABASE_URL","ELSEVIER_API_KEY","FDA_API_KEY",
"GCS_CONFIG_BUCKET","GEMINI_API_KEY","GOOGLE_APPLICATION_CREDENTIALS",
"NCBI_API_KEY","OAUTH_CALLBACK_URL","OAUTH_ENCRYPTION_KEY","OPENAI_API_KEY",
"OPENROUTER_API_KEY","OPERON_AMPLITUDE_API_KEY_DEV",
"OPERON_AMPLITUDE_API_KEY_PROD","OPERON_CONTACT_EMAIL",
"OPERON_EZPROXY_COOKIE","OPERON_EZPROXY_URL","REDIS_URL",
"SEMANTIC_SCHOLAR_API_KEY","SPRINGER_API_KEY"];

// host-loop excluded built-ins (xUA / jie-style)
var xUA = ["Bash","NotebookEdit","REPL","JavaScript","WebFetch"];

// host-loop safe set (Y2e / zvt-style); includes a spread reference
var e_ = ["TodoWrite","TaskCreate","TaskUpdate","TaskGet","TaskList","TaskStop"];
var Y2e = ["Task","Glob","Grep","Read","Edit","Write",...e_,
           "WebSearch","Skill","AskUserQuestion","ToolSearch","SendUserMessage"];
