
import { getKenjoUserAccounts } from 'backend/kenjoEmployees';
import wixLocation from 'wix-location';

let allRows = [];
let sortField = "name";
let sortDirection = "asc";

function lower(v){
  return (v == null) ? "" : String(v).toLowerCase();
}

function normalizeRow(x,i){
  const fullName =
    (x.displayName || `${x.firstName || ""} ${x.lastName || ""}`.trim()).trim();

  const email = x.email || "";
  const role = x.jobTitle || "";
  const isActive = (typeof x.isActive === "boolean") ? x.isActive : null;
  const statusLower = isActive === true ? "active" : isActive === false ? "inactive" : "unknown";
  const statusDisplay = isActive === true ? "Active" : isActive === false ? "Inactive" : "-";

  return{
    ...x,
    _id:String(x._id || i),
    _fullName:fullName,
    _emailLower:lower(email),
    _roleRaw:role,
    _roleDisplay:role || "-",
    _statusLower:statusLower,
    _statusDisplay:statusDisplay
  };
}

function ensureRepeaterVisible(){
  try{$w("#employeesRepeater").show();}catch(e){}
  try{$w("#employeesRepeater").expand();}catch(e){}
}

function buildRoleOptions(rows){
  const set = new Set();
  rows.forEach(r=>{
    const val=(r._roleRaw || "").trim();
    if(val) set.add(val);
  });
  const roles = Array.from(set).sort((a,b)=>a.localeCompare(b));
  return[
    {label:"All",value:"all"},
    ...roles.map(r=>({label:r,value:r}))
  ];
}

function buildStatusOptions(){
  return[
    {label:"All",value:"all"},
    {label:"Active",value:"active"},
    {label:"Inactive",value:"inactive"}
  ];
}

function sortRows(rows){
  return rows.sort((a,b)=>{
    let v1; let v2;
    if(sortField==="name"){
      v1=a._fullName;
      v2=b._fullName;
    }
    if(sortField==="email"){
      v1=a.email;
      v2=b.email;
    }
    v1=lower(v1);
    v2=lower(v2);
    if(v1<v2) return sortDirection==="asc" ? -1 : 1;
    if(v1>v2) return sortDirection==="asc" ? 1 : -1;
    return 0;
  });
}

function setRowsCount(shown){
  try{
    $w("#rowsCountText").text = String(shown);
  }catch(e){}
}

function applyFilters(){
  const q=lower($w("#searchInput").value).trim();
  const statusValue=($w("#statusDropdown").value || "all").toLowerCase();
  const roleValue=$w("#roleDropdown").value || "all";

  let filtered = allRows.filter(r=>{
    const matchesQuery = !q || lower(r._fullName).includes(q) || r._emailLower.includes(q);
    const matchesStatus = statusValue==="all" || r._statusLower===statusValue;
    const matchesRole = roleValue==="all" || (r._roleRaw || "")===roleValue;
    return matchesQuery && matchesStatus && matchesRole;
  });

  filtered = sortRows(filtered);
  ensureRepeaterVisible();
  $w("#employeesRepeater").data = filtered;
  setRowsCount(filtered.length);
}

function setSort(field){
  if(sortField===field){
    sortDirection = sortDirection==="asc" ? "desc" : "asc";
  }else{
    sortField = field;
    sortDirection = "asc";
  }
  applyFilters();
}

$w.onReady(async function(){
  ensureRepeaterVisible();

  $w("#employeesRepeater").onItemReady(($item,itemData)=>{
    $item("#nameText").text = itemData._fullName || itemData.email || "(no name)";
    $item("#emailText").text = itemData.email || "(no email)";
    $item("#roleText").text = itemData._roleDisplay || "-";
    $item("#statusText").text = itemData._statusDisplay || "-";
    $item("#rowBox").onClick(()=>{
      const employeeId = itemData.employeeId || itemData._id;
      wixLocation.to(`/employee?employeeId=${employeeId}`);
    });
  });

  $w("#searchInput").onInput(()=>applyFilters());
  $w("#statusDropdown").onChange(()=>applyFilters());
  $w("#roleDropdown").onChange(()=>applyFilters());
  $w("#nameHeader").onClick(()=>setSort("name"));
  $w("#emailHeader").onClick(()=>setSort("email"));

  try{
    const result = await getKenjoUserAccounts();
    const raw = Array.isArray(result) ? result : (result?.data || []);
    allRows = raw.map(normalizeRow);
    $w("#statusDropdown").options = buildStatusOptions();
    $w("#statusDropdown").value="all";
    $w("#roleDropdown").options = buildRoleOptions(allRows);
    $w("#roleDropdown").value="all";
    applyFilters();
  }catch(err){
    console.error("Error loading employees:",err);
  }
});
