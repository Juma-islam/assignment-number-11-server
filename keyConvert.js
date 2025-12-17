const fs = require('fs');
const key = fs.readFileSync('./garments-tracker-projects-firebase-adminsdk-fbsvc-270f245f6b.json', 'utf8')
const base64 = Buffer.from(key).toString('base64')
console.log(base64)