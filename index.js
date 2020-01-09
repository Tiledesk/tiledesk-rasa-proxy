const { parse } = require('querystring');
var express = require('express');
var cors = require('cors');
const uuid = require('uuid');
const bodyParser = require('body-parser');
const https = require('https');
const request = require('request');

var app = express();
app.use(cors());
app.use(express.static('public'))
app.use(bodyParser.json({limit: '50mb'}));
app.use(bodyParser.urlencoded({ extended: true , limit: '50mb'}));

const SESSION_KEY = 'session'
const UID_KEY = 'uid'
const TEXT_KEY = 'text'
const AGENT_KEY = 'agent'
const RECIPIENT_KEY = 'recipient'
const RECIPIENT_FULLNAME_KEY = 'recipientFullname'
const SENDER_KEY = 'sender'
const SENDER_FULLNAME_KEY = 'senderFullname'
const LANGUAGE_KEY = 'language'
const TYPE_KEY = 'type'
const KEY_KEY = 'key'
const STATUS_KEY = 'status'
const ATTRIBUTES_KEY = 'attributes'
const CHANNEL_TYPE_KEY = 'channel_type'
const TIMESTAMP_KEY = 'timestamp'
const METADATA_KEY = "metadata"
const TYPE_TEXT = 'text'
const TYPE_IMAGE = 'image'
const TYPE_AUDIO = 'audio'
const COMMAND_TYPE_MESSAGE = "message"
const COMMAND_TYPE_WAIT = "wait"


const endpoint = "https://tiledesk-server-pre.herokuapp.com";

function message_from_request(req) {
  return req.body
}

app.get("/hello", (req, res) => {
  res.status(200).send("Hello");
})

app.post("/bot", (req, res) => {
  delete req.body.payload.request.messages;
  console.log("BOT: req.body: " + JSON.stringify(req.body));
  const agent_id = req.params.agent;
  console.log("BOT: agent id: ", agent_id)
  var body = req.body;
  var recipient = body.payload.recipient;
  console.log("BOT: recipient", recipient);
  var text = body.payload.text;
  console.log("BOT: text", text);
  const tdrequest = body.payload.request;
  var botId = tdrequest.department.bot._id;
  console.log("BOT: botId", botId);
  var botName = tdrequest.department.bot.name;
  console.log("BOT: botName", botName);
  var token = body.token;
  console.log("BOT: token", token);
  var id_project = body.payload.id_project;
  console.log("BOT: id_project", id_project);
  console.log("BOT: request.headers.host",req.headers.host);

  // immediatly reply to TILEDESK
  res.status(200).send({"success":true});

  console.log("BOT: ASKING DF...")
  const dialogflow_session_id = tdrequest.request_id
  runRASAQuery(text, function(result) {
    console.log("BOT: DF REPLY: " + JSON.stringify(result));
    if(res.statusCode === 200) {
      
          sendMessage({ // send message back to support-group (to the end-user)
            "text": result.text,
            "type": TYPE_TEXT,
            "senderFullname": "Guest Bot (dflow)"
          }, id_project, recipient, token, function (err) {
            console.log("Message sent. Error? ", err)
          })
        
    }
  })
})

function runRASAQuery(text, callback) {
  callback({
    text: "Hello from RASA"
  })
}

function sendMessage(msg_json, project_id, recipient, token, callback) {
  console.log("Sending message to Tiledesk: " + JSON.stringify(msg_json))
  request({
    url: `${endpoint}/${project_id}/requests/${recipient}/messages`,
    headers: {
      'Content-Type' : 'application/json',
      'Authorization':'JWT '+token
    },
    json: msg_json,
    method: 'POST'
    },
    function(err, res, resbody) {
      callback(err)
    }
  );
}

var port = process.env.PORT || 3000; // heroku
app.listen(port, function () {
    console.log('Example app listening on port ', port);
});
