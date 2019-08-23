require('dotenv').config()
const { App, ExpressReceiver } = require('@slack/bolt')
const bodyParser = require('body-parser')
const emoji = require('node-emoji')
const barrel = require('barrel-js')
const firestore = require('./firestore.js')
const twilio = require('./twilio.js')
const blocks = require('./blocks.js')

const expressReceiver = new ExpressReceiver({
    signingSecret: process.env.SLACK_SIGNING_SECRET
})

const expressApp = expressReceiver.app
const jsonParser = bodyParser.json()
const urlencodedParser = bodyParser.urlencoded({ extended: false })

const app = new App({
    receiver: expressReceiver,
    authorize: () => {
        return Promise.resolve({
            botToken: process.env.SLACK_BOT_TOKEN,
            userToken: process.env.SLACK_USER_TOKEN,
        })
    },
    ignoreSelf: false,
})

expressApp.get('/ping', (req, res) => {
    console.log('<3')
    return res.send('pong')
})

expressApp.post('/twilio', urlencodedParser, async (req, res) => {
    let sender = req.body.From
    let receiver = req.body.To

    let conversation = await getConversation(sender, receiver)

    let text = req.body.Body

    let payload = {
        token: process.env.SLACK_BOT_TOKEN,
        channel: conversation.channel,
        text: text,
        username: conversation.name.split('-').map(str => str.charAt(0).toUpperCase() + str.slice(1)).join(' ')
    }
    if (conversation.picture) payload.icon_url = conversation.picture
    await app.client.chat.postMessage(payload)

    return res.send()
})

expressApp.post('/api/trigger', jsonParser, async (req, res) => {
    if (req.header('x-auth-token') !== process.env.API_TOKEN) return res.send({
        error: 'invalid_auth_token'
    })

    let id = req.body.trigger_id
    let doc = await firestore.retrieve('triggers', id)
    if (!doc.exists) return res.send({
        error: 'invalid_trigger_id'
    })

    if (!doc.data().active) return res.send({
        error: 'trigger_inactive'
    })

    let data = doc.data()
    twilio.send(data.sender, data.receiver, emoji.emojify(data.trigger.message))
    return res.send({ success: true })
})

app.event('group_rename', async ({ event, context }) => {
    try {
        let conversations = await firestore.getConversationsByChannel(event.channel.id)
        if (conversations.length) {
            conversations.forEach(async doc => {
                let data = doc.data()
                data.name = event.channel.name
                await firestore.update('conversations', doc.id, data)
            })
        }
    }
    catch (error) {
        console.error(error)
    }
})

app.event('reaction_added', async ({ event, body, context }) => {
    try {
        let docs = await firestore.getConversationsByChannel(event.item.channel)
        if (!docs.length) return

        let history = await app.client.conversations.history({
            token: context.userToken,
            channel: event.item.channel
        })

        let messages = history.messages.filter(msg => event.item.type === 'message' && msg.ts === event.item.ts)

        if (messages.length) messages.forEach(msg => {
            // only send reactions to messages coming from external sms
            if (msg.subtype && msg.subtype === 'bot_message' && msg.bot_id === process.env.SLACK_BOT_ID) {
                let reaction = emoji.emojify(':' + event.reaction + ':')
                let text = 'Reacted with ' + reaction + ' to "' + emoji.emojify(msg.text) + '"'
                sendSMS(event.item.channel, text)
            }
        })
    }
    catch (error) {
        console.error(error)
    }
})

app.action({ action_id: 'dismiss' }, async ({ ack, action, body, context }) => {
    ack()

    await app.client.chat.delete({
        token: context.botToken,
        channel: body.channel.id,
        ts: body.message.ts
    })
})


app.action({ callback_id: 'response:add' }, async ({ ack, action, body, context }) => {
    ack()

    let message = action.message.text
    if (!message || !message.length) return

    await firestore.create('responses', {
        message: message
    })

})

app.action({ action_id: 'response:send' }, async ({ ack, action, body, context }) => {
    ack()

    await app.client.chat.delete({
        token: context.botToken,
        channel: body.channel.id,
        ts: body.message.ts
    })

    let doc = await firestore.retrieve('responses', action.value)

    // send to channel triggers a `message.groups` event where the SMS is sent
    await app.client.chat.postMessage({
        token: context.userToken,
        channel: body.channel.id,
        text: doc.data().message,
        as_user: true
    })

})

app.message(/.*/, async ({ message, context }) => {
    try {
        if (message.subtype) return
        sendSMS(message.channel, message.text)
    }
    catch (error) {
        console.error(error)
    }
})

app.command('/pi-respond', async ({ command, ack, say }) => {
    ack()

    let channel = command.channel_id
    let conversations = await firestore.getConversationsByChannel(channel)
    if (!conversations.length) return

    let docs = await firestore.getCollection('responses')


    let message = blocks.response_message
    let responses = docs.map(doc => {
        let copy = JSON.parse(JSON.stringify(blocks.response))
        let compile = barrel.compile(copy, {
            id: doc.id,
            message: doc.data().message
        })
        return compile
    })

    console.log(responses)

    message = message.concat(responses)
    message = message.concat(blocks.response_actions)

    say({ blocks: message })
})

app.command('/pi-chat', async ({ command, ack, say }) => {
    ack()

    let channel = command.channel_id
    let conversations = await firestore.getConversationsByChannel(channel)
    if (!conversations.length) return

    console.log(command)

    let commands = command.text.split(' ')

    switch (commands[0]) {
        case 'picture':
            if (commands.length != 2) {
                say('Please use this format `/pi-chat picture [url]`')
            }
            let pic = commands[1]
            conversations.forEach(async doc => {
                let data = doc.data()
                data.picture = pic
                await firestore.update('conversations', doc.id, data)
            })
            say('Profile picture has been updated.')
    }
})

const getConversation = async (sender, receiver) => {
    let docs = await firestore.getConversationsBySenderAndReceiver(sender, receiver)

    if (!docs.length) {
        let conversation = await app.client.conversations.create({
            token: process.env.SLACK_USER_TOKEN,
            name: 'pi-' + sender.replace('+', ''),
            is_private: true
        })

        await app.client.conversations.invite({
            token: process.env.SLACK_USER_TOKEN,
            channel: conversation.channel.id,
            users: process.env.SLACK_BOT_USER_ID
        })

        let docRef = await firestore.create('conversations', {
            sender: sender,
            receiver: receiver,
            channel: conversation.channel.id,
            name: conversation.channel.name
        })

        let doc = await firestore.retrieve('conversations', docRef.id)
        return doc.data()
    }

    return docs[0].data()
}

const sendSMS = async (channel, text) => {
    let docs = await firestore.getConversationsByChannel(channel)

    if (docs.length) {
        docs.forEach(async doc => {
            let data = doc.data()
            text = emoji.emojify(text)
            // from has to be receiver and to has to be sender 
            twilio.send(data.receiver, data.sender, text)
        })
    }
}

const getBotUserId = async () => {
    let bot = await app.client.auth.test({
        token: process.env.SLACK_BOT_TOKEN
    })

    console.log(bot)
}


    // Start your app
    ; (async () => {
        await app.start(process.env.PORT || 3000)

        // await getBotUserId()
        console.log('⚡️ Bolt app is running!')
    })()
