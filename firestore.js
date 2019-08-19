const admin = require("firebase-admin")

admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)),
    databaseURL: `https://${process.env.FIREBASE_PROJECT_ID}.firebaseio.com`
})

const firestore = admin.firestore()

const create = async (collection, data) => {
    return await firestore.collection(collection).add(data)
}

const update = async (collection, id, data) => {
    return await firestore.collection(collection).doc(id).set(data)
}

const retrieve = async (collection, id) => {
    return await firestore.collection(collection).doc(id).get()
}

const getConversationsByChannel = async (channel) => {
    let ref = await firestore.collection('conversations').where('channel', '==', channel).get()
    return ref.docs
}

const getConversationsBySenderAndReceiver = async (sender, receiver) => {
    let ref = await firestore.collection('conversations').where('sender', '==', sender).where('receiver', '==', receiver).get()
    return ref.docs
}

const getCollection = async (collection) => {
    let ref = await firestore.collection(collection).get()
    return ref.docs
}



module.exports = {
    create: create,
    retrieve: retrieve,
    update: update,
    getConversationsByChannel: getConversationsByChannel,
    getConversationsBySenderAndReceiver: getConversationsBySenderAndReceiver,
    getCollection: getCollection
}