// Synthetic Claude Code CLI bundle fragment.
// Mimics LW8 (filter fn signature) referencing $zH (drop set), Ys_ (async allowlist),
// M58 (non-builtin extra drop), with real symbol indirection like the production bundle.

var H9="Read",Sh="WebSearch",yC="TodoWrite",W4="Grep",fj="WebFetch",E1="Glob",
    Vq="Bash",h9="PowerShell",E_="Edit",W_="Write",N_="NotebookEdit",
    Sk="Skill",So="StructuredOutput",Tl="ToolSearch",Ew="EnterWorktree",
    Xw="ExitWorktree",Re="REPL",Mo="Monitor",Ts="TaskStop";

var $zH=new Set(["TaskOutput","ExitPlanMode","EnterPlanMode","Agent","AskUserQuestion","WaitForMcpServers"]);
var M58=new Set(["TaskOutput","ExitPlanMode","EnterPlanMode","Agent","AskUserQuestion","WaitForMcpServers"]);
var Ys_=new Set([H9,Sh,yC,W4,fj,E1,Vq,h9,E_,W_,N_,Sk,So,Tl,Ew,Xw,Re,Mo,Ts]);

function LW8({tools:H,isBuiltIn:_,isAsync:q=!1,permissionMode:K}){
  return H.filter((O)=>{
    if(hG(O))return!0;
    if($zH.has(O.name))return!1;
    if(!_&&M58.has(O.name))return!1;
    if(q&&!Ys_.has(O.name))return!1;
    return!0;
  });
}
