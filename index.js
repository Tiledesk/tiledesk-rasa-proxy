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

  // immediatly reply to caller
  res.status(200).send({"success":true});

  // const messenger = new TiledeskMessengerClient({ request: req });

  console.log("BOT: ASKING DF...")
  const dialogflow_session_id = tdrequest.request_id
  runRASAQuery(text, function(result) {
    console.log("BOT: DF REPLY: " + JSON.stringify(result));
    if(res.statusCode === 200) {
      // var commands = findSplits(result)

      var commands = []
      commands[0] = {}
      commands[0].type = COMMAND_TYPE_MESSAGE
      commands[0].text = "Hi"
      commands[1] = {}
      commands[1].type = COMMAND_TYPE_WAIT
      commands[1].time = 2000
      commands[2] = {}
      commands[2].type = COMMAND_TYPE_MESSAGE
      commands[2].text = "Welcome to my RASA"
      commands[3] = {}
      commands[3].type = COMMAND_TYPE_WAIT
      commands[3].time = 2000
      commands[4] = {}
      commands[4].type = COMMAND_TYPE_MESSAGE
      commands[4].text = "Ask me your question"

      let i = 0
      function execute(command) {
        console.log("exec command: " + JSON.stringify(command))
        if (command.type === "message") {
          send_message(command, function () {
            i += 1
            if (i < commands.length) {
              // console.log("after send_message. New i: ", i)
              execute(commands[i])
            }
            else {
              console.log("last command executed (wait), exit")
            }
          })
        }
        else if (command.type === "wait") {
          setTimeout(function() {
            i += 1
            if (i < commands.length) {
              execute(commands[i])
            }
            else {
              console.log("last command executed (send message), exit")
            }
          },
          command.time)
        }
      }
        
      function send_message(command, callback) {
        if (command.type === "message") {
          const parsed_reply = parse_reply(command.text)

          if (fullname_email_in(command)) {
            updateEmailFullname(command, tdrequest, id_project, recipient, token)
          }

          sendMessage({
            "text": parsed_reply.text,
            "type": parsed_reply.type,
            // "timestamp": Date.now(),
            "attributes": parsed_reply.attributes,
            "metadata": parsed_reply.metadata,
            "senderFullname": "Guest Bot (dflow)"
          }, id_project, recipient, token, function (err) {
            console.log("Message sent. Error? ", err)
            if (dep_in(command)) {
              updateDepartment(command, tdrequest, id_project, recipient, token)
            }
            callback()
          })
        }
      }
      execute(commands[i])
    }
  })
})

function findSplits(result) {
  var commands = []
  const text = result['fulfillmentText'] // "parte 1\\splittesto12\\split\npt2.capone detto\\split:4000\npt.3. muggio\\split\npt. 4.Andtonino Mustacchio"
  // const text = "parte 1NO\\splittesto12\\split\npt2.capone detto\\split:4000\npt.3. muggio\\split\npt. 4.Dammi la tua email"
  const split_pattern = /^(\\split[:0-9]*)/mg //ex. \split:500
  var parts = text.split(split_pattern)
  for (var i=0; i < parts.length; i++) {
    p = parts[i]
    console.log("part: " + p)
    if (i % 2 != 0) {
      // split command
      console.log("split command: " + p)
      var split_parts = p.split(":")
      var wait_time = 1000
      if (split_parts.length == 2) {
        wait_time = split_parts[1]
      }
      console.log("wait time: " + wait_time)
      var command = {}
      command.type = "wait"
      command.time = parseInt(wait_time, 10)
      commands.push(command)
    }
    else {
      // message command
      var command = {}
      command.type = "message"
      command.text = p.trim()
      commands.push(command)
      if ( i == parts.length -1 &&
          result['fulfillmentMessages'] &&
          result['fulfillmentMessages'][1] &&
          result['fulfillmentMessages'][1].payload) {
        command.payload = result['fulfillmentMessages'][1].payload
      }
    }
  }
  commands.forEach(c => {
    console.log("* * * * * * * * * command: ", c)
  })
  return commands
}

function updateEmailFullname(command, tdrequest, id_project, recipient, token) {
  
  const email = command.payload.fields.email.stringValue
  const fullname = command.payload.fields.fullname.stringValue
  console.log("BOT: email: ", email)
  console.log("BOT: fullname: ", fullname)
  console.log("updates lead data")
  request({
    url: `${endpoint}/${id_project}/leads/${tdrequest.lead._id}`,
    headers: {
      'Content-Type' : 'application/json',
      'Authorization':'JWT '+token
    },
    json: {
      email: email,
      fullname: fullname
    },
    method: 'PUT'
    },
    function(err, res, resbody) {
      if (err) {
        console.log("BOT UPDATE LEAD ERROR: ", err);
      }
      console.log("BOT UPDATE LEAD, TILEDESK RESPONSE: " + JSON.stringify(resbody))
      if(res.statusCode === 200){
        console.log("BOT UPDATE LEAD, TILEDESK RESPONSE: OK")
        request({
          url: `${endpoint}/${id_project}/requests/${recipient}/attributes`,
          headers: {
            'Content-Type' : 'application/json',
            'Authorization':"JWT eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJfaWQiOiI1ZGYyNmJhMWRlN2UxYzAwMTc0M2I2MzciLCJlbWFpbCI6ImFuZHJlYS5zcG9uemllbGxvLXByZUBmcm9udGllcmUyMS5pdCIsImZpcnN0bmFtZSI6IkFuZHJlYSBwcmUiLCJsYXN0bmFtZSI6IlNwb256aWVsbG8gcHJlIiwiZW1haWx2ZXJpZmllZCI6ZmFsc2UsImlhdCI6MTU3NjE2ODM1NCwiYXVkIjoiaHR0cHM6Ly90aWxlZGVzay5jb20iLCJpc3MiOiJodHRwczovL3RpbGVkZXNrLmNvbSIsInN1YiI6InVzZXIifQ.mBuLoG84M4qaQDqbqQvzMiTRrNirrbQ7d32MKnYkhFA"
          },
          json: {
            updated: Date.now()
          },
          method: 'PATCH'
          },
          function(err, res, resbody) {
            console.log("BOT UPDATE request attributes.", err);
          }
        );
      }
    }
  );
}

function updateDepartment(command, tdrequest, id_project, recipient, token, callback) {
  const dep_id = command.payload.fields.dep_id.stringValue
  console.log("BOT: dep_id: ", dep_id)
  console.log("updating dep with: " +dep_id)
  request({
    url: `${endpoint}/${id_project}/requests/${tdrequest.request_id}/departments`,
    headers: {
      'Content-Type' : 'application/json',
      'Authorization':"JWT eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJfaWQiOiI1ZGYyNmJhMWRlN2UxYzAwMTc0M2I2MzciLCJlbWFpbCI6ImFuZHJlYS5zcG9uemllbGxvLXByZUBmcm9udGllcmUyMS5pdCIsImZpcnN0bmFtZSI6IkFuZHJlYSBwcmUiLCJsYXN0bmFtZSI6IlNwb256aWVsbG8gcHJlIiwiZW1haWx2ZXJpZmllZCI6ZmFsc2UsImlhdCI6MTU3NjE2ODM1NCwiYXVkIjoiaHR0cHM6Ly90aWxlZGVzay5jb20iLCJpc3MiOiJodHRwczovL3RpbGVkZXNrLmNvbSIsInN1YiI6InVzZXIifQ.mBuLoG84M4qaQDqbqQvzMiTRrNirrbQ7d32MKnYkhFA"
    },
    json: {
      departmentid: dep_id
    },
    method: 'PUT'
    },
    function(err, res, resbody) {
      if (err) {
        console.log("BOT UPDATE DEP ERROR: ", err);
      }
      console.log("BOT UPDATE DEP, TILEDESK RESPONSE: " + JSON.stringify(resbody))
      if(res.statusCode === 200){
        console.log("BOT UPDATE DEP, TILEDESK RESPONSE: OK")
        request({ // triggers attributes update
          url: `${endpoint}/${id_project}/requests/${recipient}/attributes`,
          headers: {
            'Content-Type' : 'application/json',
            'Authorization':"JWT eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJfaWQiOiI1ZGYyNmJhMWRlN2UxYzAwMTc0M2I2MzciLCJlbWFpbCI6ImFuZHJlYS5zcG9uemllbGxvLXByZUBmcm9udGllcmUyMS5pdCIsImZpcnN0bmFtZSI6IkFuZHJlYSBwcmUiLCJsYXN0bmFtZSI6IlNwb256aWVsbG8gcHJlIiwiZW1haWx2ZXJpZmllZCI6ZmFsc2UsImlhdCI6MTU3NjE2ODM1NCwiYXVkIjoiaHR0cHM6Ly90aWxlZGVzay5jb20iLCJpc3MiOiJodHRwczovL3RpbGVkZXNrLmNvbSIsInN1YiI6InVzZXIifQ.mBuLoG84M4qaQDqbqQvzMiTRrNirrbQ7d32MKnYkhFA"
          },
          json: {
            updated: Date.now()
          },
          method: 'PATCH' 
          },
          function(err, res, resbody) {
            console.log("BOT UPDATE request attributes.", err);
          }
        );
      }
    }
  );
  
}

function parse_reply(text) {
  var reply = {}

  console.log("TEXT: ", text)
  reply[TEXT_KEY] = text
  reply[ATTRIBUTES_KEY] = null

  // looks for images
  var image_pattern = /^\\image:.*/mg; // images are defined as a line starting with \image:IMAGE_URL
  // console.log("Searching images with image_pattern: ", image_pattern)
  var images = text.match(image_pattern);
  // console.log("images: ", images)
  if (images && images.length > 0) {
    const image_text = images[0]
    var text = text.replace(image_text,"").trim()
    const image_url = image_text.replace("\\image:", "")
    reply[TEXT_KEY] = text
    reply[TYPE_KEY] = TYPE_IMAGE
    reply[METADATA_KEY] = {
      src: image_url,
      width: 200,
      height: 200
    }
  }

  // looks for bullet buttons
  var button_pattern = /^\*.*/mg; // button pattern is a line that starts with *TEXT_OF_BUTTON (every button on a line)
  var text_buttons = text.match(button_pattern);
  if (text_buttons) {
    // ricava il testo rimuovendo i bottoni
    var text_with_removed_buttons = text.replace(button_pattern,"").trim();
    reply[TEXT_KEY] = text_with_removed_buttons
    // estrae i bottoni
    var buttons = []
    text_buttons.forEach(element => {
      var remove_extra_from_button = /^\*/mg; // removes initial "*"
      var button_text = element.replace(remove_extra_from_button, "").trim()
      var button = {}
      button[TYPE_KEY] = "text"
      button["value"] = button_text
      buttons.push(button)
      console.log("Added button: " + button_text)
    });
    if (reply[ATTRIBUTES_KEY] == null) {
      reply[ATTRIBUTES_KEY] = {}
    }
    reply[ATTRIBUTES_KEY]["attachment"] = {
      type:"template",
      buttons: buttons
    }
  }
  return reply
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

function fullname_email_in(command) {
  if (command.payload &&
      command.payload.fields &&
      command.payload.fields.email &&
      command.payload.fields.fullname) {
    return true
  }
  return false
}

function dep_in(command) {
  if (command.payload &&
      command.payload.fields &&
      command.payload.fields.dep_id) {
    return true
  }
  return false
}

var port = process.env.PORT || 3000; // heroku
app.listen(port, function () {
    console.log('Example app listening on port ', port);
});
