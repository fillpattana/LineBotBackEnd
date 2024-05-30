const { text } = require('body-parser');
var Storage = require('../initializeStorage');
var Getter = require('./Getter');

async function addSenderNameToJsonByUserId(Objects) {
    for (let Obj of Objects) {
        let userName = await Getter.getSenderName(Obj.groupId, Obj.userId);
        Obj.senderName = userName;
    }
    return Objects;
}

async function getTextByEventsFireStore(events){
    return Storage.lineTextDB.where("groupId", "==", events.source.groupId)
}

async function getFileByEventsFireStore(events){
    return Storage.lineFileDB.where("groupId", "==", events.source.groupId)
}

async function deleteGroupByIdFirestore(events){

    let textCollection = await getTextByEventsFireStore(events);
    if (!textCollection.empty) {
        await textCollection.get().then(function (querySnapshot) {
            querySnapshot.forEach(function (doc) {
                doc.ref.delete();
            });
        });
    } else {
        console.log("Text collection is empty");
    }

    let fileCollection = await getFileByEventsFireStore(events);
    if (!fileCollection.empty) {
        await fileCollection.get().then(function (querySnapshot) {
            querySnapshot.forEach(function (doc) {
                doc.ref.delete();
            });
        });
    } else {
        console.log("File collection is empty");
    }
}

async function deleteGroupByIdStorage(events){
    const storageBucket = Storage.storage.bucket(Storage.bucketName);
    const groupDirectory = storageBucket.getFiles({ prefix: `${events.source.groupId}/` });

    groupDirectory
    .then(([files]) => {
        const deletePromises = files.map(file => file.delete());
        return Promise.all(deletePromises);
    })
    .then(() => {
        console.log('Files deleted successfully');
    })
    .catch(err => {
        console.error('Error deleting files:', err);
    });
}

async function getAllTextsForGemini(groupId){
    let text = await getAllTextOrderByAsc(groupId)
    text = await addSenderNameToJsonByUserId(text)
    const messageCollection = await combineMessage(text)
    return messageCollection
}

async function getAllFilesForGemini(groupId){
    let file = await getAllFileOrderByAsc(groupId)
    file = await addSenderNameToJsonByUserId(file)
    let fileCollection = await extractImagePublicURLsforGemini(file)
    return fileCollection
}

async function combineMessage(text) {
    let messages = "";
    text.forEach(function(message) {
        messages += message.senderName + " กล่าวว่า: " + message.msgContent + "\n";
    });
    return messages;
}

async function extractImagePublicURLsforGemini(Object) {
    console.log("Entered creating array of publicURLs")
    let publicURLs = [];
    // Iterate through the array of file/text objects from firestore
    Object.forEach(obj => {
      // Filter for messageType image
      if (obj.messageType === 'image') {
        // Push the publicURL value into the publicURLs array
        publicURLs.push(obj.publicUrl);
      }
    });
    console.log("array of processed image public URLS", publicURLs)
    return publicURLs;
}

async function getAllTextOrderByAsc(groupId){
    const querySnapshot = await Storage.lineTextDB
        .where("groupId", "==", groupId)
        .orderBy("timeStamp", "asc")
        .get();
    let texts = [];
    querySnapshot.forEach(doc => {
        const data = doc.data();
        texts.push({...data});
    });
    texts = await addSenderNameToJsonByUserId(texts)
    return texts;
}

async function getAllFileOrderByAsc(groupId){
    console.log("Entered Get File")
    const querySnapshot = await Storage.lineFileDB
        .where("groupId", "==", groupId)
        .orderBy("timeStamp", "asc")
        .get();
    let files = [];
    querySnapshot.forEach(doc => {
        const data = doc.data();
        files.push({...data});
    });
    files = await addSenderNameToJsonByUserId(files)
    return files;
}

async function getTextByDateOrderByAsc(groupId, date){
    const querySnapshot = await Storage.lineTextDB
        .where("groupId", "==", groupId)
        .where("date", "==", date)
        .orderBy("timeStamp", "asc")
        .get();
    let texts = [];
    querySnapshot.forEach(doc => {
        const data = doc.data();
        texts.push({...data});
    });
    texts = await addSenderNameToJsonByUserId(texts);
    return texts;
}

async function getFileByDateOrderByAsc(groupId, date){
    console.log("Entered Get File")
    const querySnapshot = await Storage.lineFileDB
        .where("groupId", "==", groupId)
        .where("date", "==", date)
        .orderBy("timeStamp", "asc")
        .get();
    let files = [];
    querySnapshot.forEach(doc => {
        const data = doc.data();
        files.push({...data});
    });
    files = await addSenderNameToJsonByUserId(files);
    return files;
}

async function getTextsByDateForGemini(groupId, date){
    let text = await getTextByDateOrderByAsc(groupId, date)
    const messageCollection = await combineMessage(text)
    return messageCollection
}

async function getFilesByDateForGemini(groupId, date){
    let file = await getFileByDateOrderByAsc(groupId, date)
    let fileCollection = await extractImagePublicURLsforGemini(file)
    return fileCollection
}

async function textMessageByTopic(messages) {
    const THIRTY_MINUTES = 30 * 60 * 1000; // 30 minutes in milliseconds
    let combinedMessages = [];
    let currentCollection = [];
    let lastTimeStamp = null;

    function parseTimeStamp(timeStamp) {
        return new Date(Date.parse(timeStamp.replace(/-/g, ' ')));
    }

    messages.forEach(function (message) {
        const messageTime = parseTimeStamp(message.timeStamp);

        if (lastTimeStamp === null || (messageTime - lastTimeStamp) < THIRTY_MINUTES) {
            currentCollection.push(message);
        } else {
            combinedMessages.push(currentCollection);
            currentCollection = [message];
        }
        lastTimeStamp = messageTime;
    });

    // Push the last collection if there are any messages left
    if (currentCollection.length > 0) {
        combinedMessages.push(currentCollection);
    }

    const result = combinedMessages.map(collection => {
        return collection.map(message => message.senderName + " กล่าวว่า: " + message.msgContent + "\n").join('');
    });

    console.log(result);
    return result;
}

module.exports = {deleteGroupByIdFirestore, deleteGroupByIdStorage, 
    getTextByEventsFireStore, getFileByEventsFireStore, addSenderNameToJsonByUserId,
    combineMessage, getAllTextsForGemini, extractImagePublicURLsforGemini, 
    getAllFilesForGemini, getAllTextOrderByAsc, getAllFileOrderByAsc,
    getTextByDateOrderByAsc, getFileByDateOrderByAsc, getTextsByDateForGemini,
    getFilesByDateForGemini, textMessageByTopic
}