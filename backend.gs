/**
 * Altumind Internship Assessment — Apps Script backend
 *
 * Deployment:
 * 1. Create a new Google Sheet. Copy its ID from the URL into SHEET_ID below.
 * 2. Create a Google Drive folder for video responses. Copy its ID into DRIVE_FOLDER_ID below.
 * 3. Open Extensions > Apps Script on that Sheet, paste this file in as Code.gs.
 * 4. Deploy > New deployment > type "Web app". Execute as "Me", access "Anyone".
 * 5. Copy the Web App URL into ENDPOINT_URL in index.html.
 * 6. Re-deploy (new version) any time you edit this file — the URL stays the same
 *    only if you edit an existing deployment rather than creating a new one.
 */

const SHEET_ID = "REPLACE_WITH_YOUR_SHEET_ID";
const DRIVE_FOLDER_ID = "REPLACE_WITH_YOUR_DRIVE_FOLDER_ID";

const RESPONSES_TAB = "Responses";
const SESSIONS_TAB = "Sessions";

function doPost(e){
  try{
    const data = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.openById(SHEET_ID);

    if(data.type === "session_start"){
      logSessionEvent(ss, data, "started");
    } else if(data.type === "session_complete" || data.type === "session_complete_autotimeout"){
      logSessionEvent(ss, data, data.type === "session_complete_autotimeout" ? "auto-completed (time limit)" : "completed");
    } else if(data.type === "question_submit" || data.type === "question_submit_autotimeout"){
      logQuestionResponse(ss, data);
    }

    return ContentService.createTextOutput(JSON.stringify({ok:true}))
      .setMimeType(ContentService.MimeType.JSON);
  } catch(err){
    return ContentService.createTextOutput(JSON.stringify({ok:false, error:String(err)}))
      .setMimeType(ContentService.MimeType.JSON);
  }
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
    ["Timestamp","Candidate Name","Candidate Email","Session","Status","Roles Selected","Question IDs"]);
  sheet.appendRow([
    data.timestamp || new Date().toISOString(),
    data.candidate ? data.candidate.name : "",
    data.candidate ? data.candidate.email : "",
    data.session || "",
    status,
    data.roles ? data.roles.join(", ") : "",
    data.questionIds ? data.questionIds.join(", ") : ""
  ]);
}

function logQuestionResponse(ss, data){
  const sheet = getOrCreateSheet(ss, RESPONSES_TAB,
    ["Timestamp","Candidate Name","Candidate Email","Session","Section","Question ID",
     "Answer Text","Selected Option","Correct?","Video Link","Time Spent (sec)","Auto-submitted (timeout)"]);

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
    data.type === "question_submit_autotimeout" ? "Yes" : "No"
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

/** Optional: simple GET handler so you can sanity-check the deployment in a browser. */
function doGet(e){
  return ContentService.createTextOutput("Altumind assessment backend is live.");
}
