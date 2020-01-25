const fs = require('fs');
const dateFormat = require('dateformat');

let logFile = "log.txt"

function log(msg) {
    msg = getTime() + msg;

    fs.appendFile(logFile, msg + "\n", (err) => {
        if (err) throw err;
    })

    console.log(msg);
}

function error(e) {
    msg = `**********\nError at ${getTime()}\n\n${e}\n\n**********`

    fs.appendFile(logFile, msg + "\n", (err) => {
        if (err) throw err;
    })

    console.error(msg);
}

function verifyExists(filename, callback) {
    fs.access(filename)

    callback();
}

function getTime() {
    let date = new Date;
    return dateFormat(date, "ddd mm/dd/yyyy hh:MM:ssTT - ")
}

module.exports.log = log;
module.exports.error = error;