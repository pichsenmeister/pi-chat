module.exports = {
    response: {
        "type": "section",
        "text": {
            "type": "mrkdwn",
            "text": "${message}"
        },
        "accessory": {
            "action_id": "response:send",
            "type": "button",
            "text": {
                "type": "plain_text",
                "text": "Send :incoming_envelope:",
                "emoji": true
            },
            "value": "${id}"
        }
    },
    response_actions: [
        {
            "type": "divider"
        },
        {
            "type": "actions",
            "elements": [
                {
                    "action_id": "dismiss",
                    "type": "button",
                    "text": {
                        "type": "plain_text",
                        "text": "Dismiss",
                        "emoji": true
                    },
                    "value": "dismiss"
                }
            ]
        }
    ],
    response_message: [
        {
            "type": "section",
            "text": {
                "type": "mrkdwn",
                "text": "*Please choose a response*"
            }
        },
        {
            "type": "divider"
        }
    ]
}