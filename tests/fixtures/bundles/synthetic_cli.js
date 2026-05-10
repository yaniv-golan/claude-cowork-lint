// Synthetic Claude Code CLI bundle fragment.
// Mimics LW8 (filter fn signature) and Ys_ (async allowlist).

function LW8({tools:H,isBuiltIn:_,isAsync:q=!1,permissionMode:K}){
  return H.filter(t=>true);
}

var Ys_ = new Set(["Read","WebSearch","TodoWrite","Grep","WebFetch","Glob",
"Bash","PowerShell","Edit","Write","NotebookEdit","Skill","StructuredOutput",
"ToolSearch","EnterWorktree","ExitWorktree","REPL","Monitor","TaskStop"]);
