/**
 * Altumind Internship Assessment — Apps Script backend
 *
 * Deployment:
 * 1. Create a new Google Sheet. Copy its ID from the URL into SHEET_ID below.
 * 2. Create a Google Drive folder for video responses. Copy its ID into DRIVE_FOLDER_ID below.
 * 3. Set ADMIN_KEY below to a secret string of your choosing — this gates the live-map
 *    endpoint so a random visitor to your Web App URL can't see candidate locations.
 * 4. Open Extensions > Apps Script on that Sheet, paste this file in as Code.gs.
 * 5. Deploy > New deployment > type "Web app". Execute as "Me", access "Anyone".
 * 6. Copy the Web App URL into ENDPOINT_URL in index.html, and into the prompt on
 *    first load of admin.html (or edit ADMIN_ENDPOINT_URL directly in admin.html).
 * 7. Re-deploy (new version) any time you edit this file — the URL stays the same
 *    only if you edit an existing deployment rather than creating a new one.
 */

const SHEET_ID = "REPLACE_WITH_YOUR_SHEET_ID";
const DRIVE_FOLDER_ID = "REPLACE_WITH_YOUR_DRIVE_FOLDER_ID";
const ADMIN_KEY = "REPLACE_WITH_A_SECRET_OF_YOUR_CHOOSING";

const RESPONSES_TAB = "Responses";
const SESSIONS_TAB = "Sessions";
const LIVE_TAB = "Live";

// A candidate is treated as "currently logged in" for the live map if their most
// recent heartbeat is within this many seconds. Heartbeats are sent every 20s from
// the app, so 60s tolerates one or two missed pings before dropping them from the map.
const LIVE_WINDOW_SECONDS = 60;

function doPost(e){
  try{
    const data = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.openById(SHEET_ID);

    if(data.type === "session_start"){
      logSessionEvent(ss, data, "started");
      upsertLive(ss, data);
    } else if(data.type === "session_complete" || data.type === "session_complete_autotimeout"){
      const status = data.type === "session_complete_autotimeout"
        ? "auto-completed (" + (data.reason || "time_limit") + ")"
        : "completed";
      logSessionEvent(ss, data, status);
      removeLive(ss, data);
    } else if(data.type === "question_submit" || data.type === "question_submit_autotimeout"){
      logQuestionResponse(ss, data);
    } else if(data.type === "heartbeat"){
      upsertLive(ss, data);
    }

    return ContentService.createTextOutput(JSON.stringify({ok:true}))
      .setMimeType(ContentService.MimeType.JSON);
  } catch(err){
    return ContentService.createTextOutput(JSON.stringify({ok:false, error:String(err)}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * GET ?action=live&key=ADMIN_KEY — returns JSON of candidates whose last heartbeat
 * was within LIVE_WINDOW_SECONDS, for the admin live-map page to poll.
 * Any other GET just confirms the deployment is reachable.
 */
function doGet(e){
  const params = e && e.parameter ? e.parameter : {};
  if(params.action === "live"){
    if(params.key !== ADMIN_KEY){
      return jsonOutput({ok:false, error:"Invalid key"});
    }
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const rows = getLiveRows(ss);
    return jsonOutput({ok:true, candidates:rows});
  }
  if(params.action === "check_attempt"){
    const ss = SpreadsheetApp.openById(SHEET_ID);
    const used = hasExistingAttempt(ss, params.email, params.session);
    return jsonOutput({ok:true, alreadyUsed:used});
  }
  return ContentService.createTextOutput("Altumind assessment backend is live.");
}

/** Returns true if this email has any logged Sessions row (started or completed) for this session. */
function hasExistingAttempt(ss, email, session){
  if(!email || !session) return false;
  const sheet = ss.getSheetByName(SESSIONS_TAB);
  if(!sheet) return false;
  const values = sheet.getDataRange().getValues();
  const emailLower = String(email).toLowerCase();
  for(let i=1;i<values.length;i++){
    const rowEmail = String(values[i][2] || "").toLowerCase();
    const rowSession = values[i][3];
    if(rowEmail === emailLower && rowSession === session) return true;
  }
  return false;
}

function jsonOutput(obj){
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function getOrCreateSheet(ss, name, headers){
  let sheet = ss.getSheetByName(name);
  if(!sheet){
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function logSessionEvent(ss, data, status){
  const sheet = getOrCreateSheet(ss, SESSIONS_TAB,
    ["Timestamp","Candidate Name","Candidate Email","Session","Status","Roles Selected","Question IDs","Location Source","Lat","Lng","City","Region"]);
  const loc = data.location || {};
  sheet.appendRow([
    data.timestamp || new Date().toISOString(),
    data.candidate ? data.candidate.name : "",
    data.candidate ? data.candidate.email : "",
    data.session || "",
    status,
    data.roles ? data.roles.join(", ") : "",
    data.questionIds ? data.questionIds.join(", ") : "",
    loc.source || "",
    loc.lat != null ? loc.lat : "",
    loc.lng != null ? loc.lng : "",
    loc.city || "",
    loc.region || ""
  ]);
}

function logQuestionResponse(ss, data){
  const sheet = getOrCreateSheet(ss, RESPONSES_TAB,
    ["Timestamp","Candidate Name","Candidate Email","Session","Section","Question ID",
     "Answer Text","Selected Option","Correct?","Video Link","Time Spent (sec)","Auto-submitted (timeout)","Reason"]);

  let videoLink = "";
  if(data.videoBase64){
    videoLink = saveVideoToDrive(data);
  }

  sheet.appendRow([
    data.timestamp || new Date().toISOString(),
    data.candidate ? data.candidate.name : "",
    data.candidate ? data.candidate.email : "",
    data.session || "",
    data.section || "",
    data.questionId || "",
    data.answerText || "",
    data.selectedOptionText || "",
    data.isCorrect === true ? "Yes" : (data.isCorrect === false ? "No" : ""),
    videoLink,
    data.timeSpentSec || 0,
    data.type === "question_submit_autotimeout" ? "Yes" : "No",
    data.reason || ""
  ]);
}

function saveVideoToDrive(data){
  const rootFolder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
  const candidateName = (data.candidate && data.candidate.name) ? data.candidate.name : "unknown";
  const safeName = candidateName.replace(/[^a-zA-Z0-9]/g, "_");

  let candidateFolder;
  const existing = rootFolder.getFoldersByName(safeName);
  candidateFolder = existing.hasNext() ? existing.next() : rootFolder.createFolder(safeName);

  const bytes = Utilities.base64Decode(data.videoBase64);
  const blob = Utilities.newBlob(bytes, data.videoMime || "video/webm",
    (data.questionId || "response") + "_" + new Date().getTime() + ".webm");

  const file = candidateFolder.createFile(blob);
  return file.getUrl();
}

/* ---------- Live tracking (for the admin live map) ---------- */

const LIVE_HEADERS = ["Candidate Email","Candidate Name","Session","Lat","Lng","Location Source","City","Region","Current Question","Last Seen"];

function upsertLive(ss, data){
  const sheet = getOrCreateSheet(ss, LIVE_TAB, LIVE_HEADERS);
  const email = data.candidate ? data.candidate.email : "";
  if(!email) return;

  const loc = data.location || {};
  const rowValues = [
    email,
    data.candidate ? data.candidate.name : "",
    data.session || "",
    loc.lat != null ? loc.lat : "",
    loc.lng != null ? loc.lng : "",
    loc.source || "",
    loc.city || "",
    loc.region || "",
    data.currentQuestionId || "",
    data.timestamp || new Date().toISOString()
  ];

  const values = sheet.getDataRange().getValues();
  let rowIndex = -1;
  for(let i=1;i<values.length;i++){
    if(values[i][0] === email && values[i][2] === data.session){ rowIndex = i+1; break; }
  }
  if(rowIndex > 0){
    sheet.getRange(rowIndex,1,1,rowValues.length).setValues([rowValues]);
  } else {
    sheet.appendRow(rowValues);
  }
}

function removeLive(ss, data){
  const sheet = ss.getSheetByName(LIVE_TAB);
  if(!sheet) return;
  const email = data.candidate ? data.candidate.email : "";
  const values = sheet.getDataRange().getValues();
  for(let i=values.length-1;i>=1;i--){
    if(values[i][0] === email && values[i][2] === data.session){
      sheet.deleteRow(i+1);
    }
  }
}

function getLiveRows(ss){
  const sheet = ss.getSheetByName(LIVE_TAB);
  if(!sheet) return [];
  const values = sheet.getDataRange().getValues();
  const now = new Date().getTime();
  const out = [];
  for(let i=1;i<values.length;i++){
    const row = values[i];
    const lastSeen = new Date(row[9]).getTime();
    if(isNaN(lastSeen)) continue;
    if((now - lastSeen) / 1000 > LIVE_WINDOW_SECONDS) continue;
    out.push({
      email:row[0], name:row[1], session:row[2],
      lat:row[3], lng:row[4], locationSource:row[5],
      city:row[6], region:row[7],
      currentQuestion:row[8], lastSeen:row[9]
    });
  }
  return out;
}
