const { parse } = require('querystring');
var express = require('express');
var cors = require('cors');
const uuid = require('uuid');
const bodyParser = require('body-parser');
const https = require('https');
const multer = require('multer');
const util = require('util');
const fs = require('fs');
var exec = require('child_process').exec
const request = require('request');
const { WebhookClient } = require('dialogflow-fulfillment');
const { TiledeskMessengerClient } = require('./tiledesk-messenger')
const dialogflow = require('dialogflow');

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

const endpoint = "https://tiledesk-server-pre.herokuapp.com";

var sessions = {}

function currentSession(sessionId) {
  if (sessions[sessionId] == null) {
    sessions[sessionId] = {}
    sessions[sessionId].id = sessionId
  }
  return sessions[sessionId]
}

app.post('/dfwebhook', (req, res) => {
  console.log("Webhook. Request body: " + JSON.stringify(req.body));
  const agent = new WebhookClient({ request: req, response: res });
  const df_intent = agent.intent.toLowerCase()
  console.log('Webhook. Intent: ', agent.intent);
  console.log('Webhook. agent.session: ', agent.session);
  const session = currentSession(agent.session)
  console.log("Webhook. agent.parameters ", agent.parameters)
  // console.log("Webhook. agent.contexts ", agent.contexts)
  if (agent.parameters.email) {
    session.email = agent.parameters.email
    console.log("user email " + session.email + " added to session " + session.id)
  }
  if (agent.parameters.name) {
    session.name = agent.parameters.name
    console.log("user fullname " + session.name + " added to session " + session.id)
  }
  console.log("Current session: ", session)
  if (req.body.queryResult) {
    console.log('Webhook. req.body.queryResult.fullfillmentText: ', req.body.queryResult.fulfillmentText)
  }
  if (df_intent === "email") {
    var df_res = {}
    df_res['fulfillmentText'] = "Email ok.\n\\split:4000\nWhat is your fullname?"
    res.status(200).send(JSON.stringify(df_res));
  }
  else if (df_intent === "fullname") {
    // get departments to build the reply
    request({
      url: `${endpoint}/5df26badde7e1c001743b63c/departments/allstatus`,
      headers: {
        'Content-Type' : 'application/json',
        'Authorization':"JWT eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJfaWQiOiI1ZGYyNmJhMWRlN2UxYzAwMTc0M2I2MzciLCJlbWFpbCI6ImFuZHJlYS5zcG9uemllbGxvLXByZUBmcm9udGllcmUyMS5pdCIsImZpcnN0bmFtZSI6IkFuZHJlYSBwcmUiLCJsYXN0bmFtZSI6IlNwb256aWVsbG8gcHJlIiwiZW1haWx2ZXJpZmllZCI6ZmFsc2UsImlhdCI6MTU3NjE2ODM1NCwiYXVkIjoiaHR0cHM6Ly90aWxlZGVzay5jb20iLCJpc3MiOiJodHRwczovL3RpbGVkZXNrLmNvbSIsInN1YiI6InVzZXIifQ.mBuLoG84M4qaQDqbqQvzMiTRrNirrbQ7d32MKnYkhFA"
      },
      json: {
        updated: true
      },
      method: 'GET'
      },
      function(err, response, departments) {
        if (err) {
          console.log("ERROR: ", err);
        }
        if(res.statusCode === 200){
          
          session.departments = departments
          var deps_menu = ''
          departments.forEach( dep => {
            if (dep.name != "Default Department") {
              deps_menu += `\n*${dep.name}`
            }
          })
          
          const reply = chooseDepartmentReply(session)
          const df_res = buildFullnameResponse(reply, session)
          resetContext(session, df_res, "emailok")
          resetContext(session, df_res, "askemail")
          console.log("+++************* ", df_res)
          res.status(200).send(JSON.stringify(df_res));


        }
      }
    );
  }
  // else if (df_intent === "choose department") {
  //   console.log("---------- department intent was selected.")
  //   var df_res = {}
  //   df_res['fulfillmentText'] = "You choosed Dep " + agent.parameters.department
  //   res.status(200).send(JSON.stringify(df_res));
  // }
  else if (df_intent === "choose department fallback") {
    console.log("********** choose department fallback intent was selected.")
    const dep_name = req.body.queryResult.queryText
    console.log("dep_name = " + dep_name)
    var reply
    const dep = departmentByName(session.departments, dep_name)
    if (dep) {
      session.department = dep
      reply = "You are being redirected to " + dep_name + " team..."
      console.log("reply.... " + reply)
      var df_res = buildDepartmentResponse(reply, session)
      resetContext(session, df_res, "nameok")
      console.log("Sending back dep response........ ", JSON.stringify(df_res))
      res.status(200).send(JSON.stringify(df_res));
    } else {
      var df_res = {}
      reply = "This team doesn't exist\\split\n" + chooseDepartmentReply(session)
      df_res['fulfillmentText'] = reply
      res.status(200).send(JSON.stringify(df_res));
    }
  }
});

function chooseDepartmentReply(session) {
  var deps_menu = ''
  session.departments.forEach( dep => {
    if (dep.name != "Default Department") {
      deps_menu += `\n*${dep.name}`
    }
  })
  const reply = "Hi " + session.name + "\n\\split\nPlease choose a Team." + deps_menu
  return reply
}

function departmentByName(departments, name) {
  var found_dep = null
  departments.forEach(dep => {
    if (dep.name.toLowerCase() === name.toLowerCase()) {
      found_dep = dep
    }
  })
  return found_dep
}

function resetContext(session, df_res, context) {
  if (df_res["outputContexts"] == null) {
    df_res["outputContexts"] = []
  }
  df_res["outputContexts"].push(
    {
      "name": `${session.id}/contexts/${context}`,
      "lifespanCount": 0
    }
  )
}

function buildFullnameResponse(reply, session) {
  var df_res = {}
  df_res['fulfillmentText'] = reply
  df_res['fulfillmentMessages'] = [
    {
      "text": {
        "text": [
          reply
        ]
      }
    },
    {
      "payload": {
        "email" : session.email,
        "fullname": session.name
      }
    }
  ]
  return df_res
}

function buildDepartmentResponse(reply, session) {
  df_res = {}
  df_res['fulfillmentText'] = reply
  df_res['fulfillmentMessages'] = [
    {
      "text": {
        "text": [
          reply
        ]
      }
    },
    {
      "payload": {
        "dep_id" : session.department._id
      }
    }
  ]
  return df_res
}

// function validateEmail(email) {
//   var re = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
//   return re.test(String(email).toLowerCase());
// }

app.post('/proxy', (req, res) => {
  var text = "ciao";
  // INCOMING MESSAGE FORMAT EXAMPLE:
  // {
  //   uid: 'e5ae9361-e6b3-4716-bb2a-6ec3cba52125',
  //   language: 'en',
  //   recipient: 'joyfood-jcjglv',
  //   recipient_fullname: 'Joy Bot',
  //   sender: 'test_user_id',
  //   sender_fullname: 'Guest',
  //   status: '150',
  //   metadata: '',
  //   text: 'ciao',
  //   timestamp: 1576236649172,
  //   headerDate: 'Oggi',
  //   type: 'text',
  //   attributes: {
  //     client: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/78.0.3904.108 Safari/537.36',
  //     sourcePage: 'https://dialogflow-proxy-tiledesk.herokuapp.com/',
  //     projectId: 'bot_conversation',
  //     requester_id: 'test_user_id',
  //     uid: 'e5ae9361-e6b3-4716-bb2a-6ec3cba52125'
  //   },
  //   channel_type: 'group',
  //   projectid: 'bot_conversation',
  //   session: 'd3e79b74-1608-415e-84e1-f3e0e43fb7b4',
  //   agent: 'joyfood-jcjglv'
  // }

  // uid: uuid.v4(),
  // language: 'it',
  // recipient: 'joyfood-jcjglv',
  // recipient_fullname: '',
  // sender: '',
  // sender_fullname: '',
  // status: '',
  // metadata: '',
  // text: 'ciao',
  // // timestamp: 1576236649172,
  // // headerDate: 'Oggi',
  // type: 'text',
  // // attributes: {
  // //   client: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/78.0.3904.108 Safari/537.36',
  // //   sourcePage: 'https://dialogflow-proxy-tiledesk.herokuapp.com/',
  // //   projectId: 'bot_conversation',
  // //   requester_id: 'test_user_id',
  // //   uid: 'e5ae9361-e6b3-4716-bb2a-6ec3cba52125'
  // // },
  // channel_type: 'group',
  // // projectid: 'bot_conversation',
  // session: body.payload.sender,
  // agent: 'joyfood-jcjglv'

  var sessionId = uuid.v4();
  const in_message = message_from_request(req)
  console.log("incoming message: " + JSON.stringify(in_message))
  if (in_message[TEXT_KEY]) {
    text = in_message[TEXT_KEY]
  }

  if (in_message[SESSION_KEY]) {
    sessionId = in_message[SESSION_KEY]
    console.log('Proxy: user provided session: ' + sessionId);
  } else {
    console.log('Proxy. Warning: user session not speciefied. Using Auto-session: ' + sessionId);
  }
  if (in_message[AGENT_KEY]) {
    agent_id = in_message[AGENT_KEY]
  }
  else {
    console.log("Proxy. Error. Agent id not specified.");
    return;
  }
  
  const recipient = in_message[RECIPIENT_KEY]
  const recipientFullname = in_message[RECIPIENT_FULLNAME_KEY]
  const sender = in_message[SENDER_KEY]
  const senderFullname = in_message[SENDER_FULLNAME_KEY]
  const message_uid = in_message[UID_KEY];

  const message_type = in_message[TYPE_KEY]
  console.log("Proxy. in_message.type: ", message_type);
  const channel_type = in_message[CHANNEL_TYPE_KEY]
  var language_code = in_message[LANGUAGE_KEY]
  if(!language_code || language_code.length < 5) {
    language_code = 'it-IT'
  }
  console.log("Proxy. Using language code: ", language_code);

  var audio_filename = null;
  if (message_type === 'audio') {
    audio_filename = message_uid + ".wav"
    console.log("Proxy. In message decoded audio file name: " + audio_filename)
    text = null
  }

  runDFQuery(text, audio_filename, agent_id, sessionId, language_code)
  .then(function(result) {
        var repl_message = {}
        repl_message[KEY_KEY] = uuid.v4();
        repl_message[LANGUAGE_KEY] = language_code
        repl_message[RECIPIENT_KEY] = sender
        repl_message[RECIPIENT_KEY] = senderFullname
        repl_message[SENDER_KEY] = recipient
        repl_message[SENDER_FULLNAME_KEY] = recipientFullname
        repl_message[STATUS_KEY] = '150'
        
        const telegram_quickreplies = result['fulfillmentMessages'][0]['quickReplies']
        if (telegram_quickreplies) {
          repl_message[TEXT_KEY] = telegram_quickreplies['title']
          const replies = telegram_quickreplies['quickReplies']
          var buttons = []
          replies.forEach(element => {
            var button = {}
            button["type"] = "text"
            button["value"] = element
            buttons.push(button)
          });
          repl_message[ATTRIBUTES_KEY] =
          {
            attachment: {
              type:"template",
              buttons: buttons
            }
          }
        } else {
          console.log("Proxy. No telegram quickreplies defined, skipping and using fullfillmentText.")
          repl_message[TEXT_KEY] = result['fulfillmentText']
          var text = result['fulfillmentText'];
          repl_message[TYPE_KEY] = TYPE_TEXT

          // looks for images
          var image_pattern = /^\\image:.*/mg; // images are defined as a line starting with \image:IMAGE_URL
          console.log("Searching images with image_pattern: ", image_pattern)
          var images = text.match(image_pattern);
          console.log("images: ", images)
          if (images && images.length > 0) {
            const image_text = images[0]
            var text = text.replace(image_text,"").trim()
            const image_url = image_text.replace("\\image:", "")
            repl_message[TEXT_KEY] = text
            repl_message[TYPE_KEY] = TYPE_IMAGE
            repl_message[METADATA_KEY] = {
              src: image_url,
              width: 200,
              height: 200 
            }
          }

          // looks for bullet buttons
          var button_pattern = /^\*.*/mg; // buttons are defined as a line starting with an asterisk
          var buttons_matches = text.match(button_pattern);
          if (buttons_matches) {
            text = text.replace(button_pattern,"").trim();
            repl_message[TEXT_KEY] = text
            var buttons = []
            buttons_matches.forEach(element => {
              console.log("button ", element)
              var remove_extra_from_button = /^\*/mg;
              var button_text = element.replace(remove_extra_from_button, "").trim()
              var button = {}
              button["type"] = "text"
              button["value"] = button_text
              buttons.push(button)
            });
            repl_message[ATTRIBUTES_KEY] =
            { 
              attachment: {
                type:"template",
                buttons: buttons
              }
            }
          }

        }

        // AUDIO
        console.log("Proxy. result.audioFilePath:::" + result.audioFilePath)
        if (result.audioFilePath) {
          repl_message['metadata'] = {
            src: result.audioFilePath,
            type: "audio",
            uid: message_uid
          }
          repl_message[TYPE_KEY] = TYPE_AUDIO
          repl_message[ATTRIBUTES_KEY]["alwaysShowText"] = true // shows text + audio
        }
        // else {
        //   repl_message[TYPE_KEY] = 'text'
        // }
        repl_message[TIMESTAMP_KEY] = new Date()
        repl_message[CHANNEL_TYPE_KEY] = channel_type
        res.status(200).send(repl_message);
    })
  .catch(function(err) {
        console.log('error: ', err);
    });
});

function message_from_request(req) {
  return req.body
}

async function runDFQuery(text, audio_filename, agent_id, sessionId, language_code) {
  // A unique identifier for the given session
  // const sessionId = uuid.v4();
  console.log("DF QUERY: agent_id: ", agent_id);
  console.log("DF QUERY: sessionId: ", sessionId);
  console.log("DF QUERY: query text: ", text);
  console.log("DF QUERY: query audio file: ", audio_filename);
  console.log("DF QUERY: language code: ", language_code);
  
  const audio_file_path = "public/audio/" + audio_filename
  if(!language_code) {
    language_code = 'it-IT'
  }

  // Create a new session
  const GOOGLE_CREDENTIALS_FOLDER = 'google_credentials/'
  var files = fs.readdirSync(GOOGLE_CREDENTIALS_FOLDER);
  var credentials_filename
  for (var i= 0; i < files.length; i++) {
    f = files[i]
    console.log("DF QUERY. found: ", f)
    if (f.startsWith(agent_id)) {
      // console.log("found: ", f)
      credentials_filename = f
      break
    }
  }
  credentials_path = GOOGLE_CREDENTIALS_FOLDER + credentials_filename
  try {
    if (fs.existsSync(credentials_path)) {
      console.log("DF QUERY. credentials file exists")
    }
    else {
      console.log("DF QUERY. ERROR: credentials file do not exist!")
    }
  } catch(err) {
    console.error(err)
  }
  console.log('DF QUERY. Using google credentials file: ' + credentials_path)
  var credentials
  // fs.readFile(credentials_path, 'utf8', function (err, data) {
  //   console.log("err reading credentials? ", err)
  //   if (err) throw err;
  //   credentials = JSON.parse(data);
  // });
  var credentials_content = fs.readFileSync(credentials_path, 'utf8')
  credentials = JSON.parse(credentials_content);
  
  const sessionClient = new dialogflow.SessionsClient({'credentials':credentials});
  const sessionPath = sessionClient.sessionPath(agent_id, sessionId);
  
  var request;
  if (text) {
    console.log("DF QUERY. Input Text: ", text)
    request = {
      session: sessionPath,
      queryInput: {
        text: {
          text: text,
          languageCode: language_code,
        },
      },
    };
  } else {
    const readFile = util.promisify(fs.readFile);
    const inputAudio = await readFile(audio_file_path);
    console.log("DF QUERY. InputAudio: ", inputAudio)
    request = {
      session: sessionPath,
      queryInput: {
        audioConfig: {
          audioEncoding: 'Linear16',
          // sampleRateHertz: 16000, // 44100
          languageCode: language_code,
          encoding: `LINEAR16`,
          audioChannelCount: 1
          // enableSeparateRecognitionPerChannel: false
        },
      },
      inputAudio: inputAudio,
      outputAudioConfig: {
        audioEncoding: `OUTPUT_AUDIO_ENCODING_LINEAR_16`,
      }
    };
  }

  // Send request and log result
  const responses = await sessionClient.detectIntent(request);
  console.log('DF QUERY: Detected intent');
  var responses_str = JSON.stringify(responses)
  const result = responses[0].queryResult;
  console.log(`DF QUERY: Query: ${result.queryText}`);
  console.log(`DF QUERY: Response: ${result.fulfillmentText}`);
  if (result.intent) {
    console.log(`DF QUERY: Intent: ${result.intent.displayName}`);
    const audioFile = responses[0].outputAudio;
    if (audioFile != null && audioFile.length != 0) {
      console.log('DF QUERY. Audio file found in reply message.')
      const outputFilePath = '/audioout/' + audio_filename
      const outputFile = './public' + outputFilePath
      util.promisify(fs.writeFile)(outputFile, audioFile, 'binary');
      console.log(`DF QUERY. Audio content written to file: ${outputFile}`);
      result.audioFilePath = audio_service_base_url + outputFilePath
      console.log("DF QUERY. result.audioFilePath: " + result.audioFilePath)
    } else {
      console.log('DF QUERY. No audio file found in reply message.')
    }
    // });
  } else {
    console.log(`DF QUERY: No intent matched.`);
  }
  return result;
}

app.post("/messagecreate", (req, res) => {
  console.log("webhook message.create: req.body: " + JSON.stringify(req.body));
})

app.post("/bot/:agent", (req, res) => {
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
  res.send({"success":true});

  // const messenger = new TiledeskMessengerClient({ request: req });

  console.log("BOT: ASKING DF...")
  const dialogflow_session_id = tdrequest.request_id
  runDFQuery(text, null, agent_id, dialogflow_session_id, 'it-IT')
  .then(function(result) {
    console.log("BOT: DF REPLY: " + JSON.stringify(result));
    if(res.statusCode === 200) {
      var commands = findSplits(result)
      // test
      // var commands = []
      // commands[0] = {}
      // commands[0].type = "message"
      // commands[0].text = "ciao1. Aspetto 4 s"
      // commands[1] = {}
      // commands[1].type = "wait"
      // commands[1].time = 4000
      // commands[2] = {}
      // commands[2].type = "message"
      // commands[2].text = "ciao2. Aspetto 16 s"
      // commands[3] = {}
      // commands[3].type = "wait"
      // commands[3].time = 16000
      // commands[4] = {}
      // commands[4].type = "message"
      // commands[4].text = "ciao3"
      // commands.forEach(c => {
      //   console.log("command: ", c)
      // })

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
  .catch(function(err) {
    console.log('BOT: error: ', err);
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
  // if (result['fulfillmentMessages'] &&
  //     result['fulfillmentMessages'][1] &&
  //     result['fulfillmentMessages'][1].payload &&
  //     result['fulfillmentMessages'][1].payload.fields &&
  //     result['fulfillmentMessages'][1].payload.fields.email &&
  //     result['fulfillmentMessages'][1].payload.fields.fullname) {
      if (command.payload &&
          command.payload.fields &&
          command.payload.fields.email &&
          command.payload.fields.fullname) {
    return true
  }
  return false
}

function dep_in(command) {
  // if (result['fulfillmentMessages'] &&
  //     result['fulfillmentMessages'][1] &&
  //     result['fulfillmentMessages'][1].payload &&
  //     result['fulfillmentMessages'][1].payload.fields &&
  //     result['fulfillmentMessages'][1].payload.fields.dep_id) {
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
