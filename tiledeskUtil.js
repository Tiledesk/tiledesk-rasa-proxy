/* 
    ver 0.7
    (c) Tiledesk.com
*/

class TiledeskUtil {    

    /* Splits a message in multiple commands using the microlanguage \split:TIME command
     ex.

    <<Hi!
    \split:1000
    Please tell me your email>>

    Sends two messages delayed by 1 second    
    */
    findSplits(result) {
        var commands = []
        const text = result['fulfillmentText'] // "parte 1\\splittesto12\\split\npt2.capone detto\\split:4000\npt.3. muggio\\split\npt. 4.Andtonino Mustacchio"
        // const text = "parte 1NO\\splittesto12\\split\npt2.capone detto\\split:4000\npt.3. muggio\\split\npt. 4.Dammi la tua email"
        const split_pattern = /^(\\split[:0-9]*)/mg //ex. \split:500
        var parts = text.split(split_pattern)
        for (var i=0; i < parts.length; i++) {
            let p = parts[i]
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

    parseReply(text) {
        

        let TEXT_KEY = 'text'

        let TYPE_KEY = 'type'
        let ATTRIBUTES_KEY = 'attributes'
        let METADATA_KEY = "metadata"
        let TYPE_IMAGE = 'image'

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

}

 var tiledeskUtil = new TiledeskUtil();

 module.exports = tiledeskUtil;