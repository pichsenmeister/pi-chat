const accountSid = process.env.TWILIO_API_KEY
const authToken = process.env.TWILIO_API_SECRET
const client = require('twilio')(accountSid, authToken)

const send = async (from, to, msg) => {
    try {
        await client.messages.create({
            body: msg,
            from: from,
            to: to
        })
    } catch (e) { console.log(e) }
}

module.exports = {
    send: send
}