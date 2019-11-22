const fs = require('fs'); //todo export to file
const dateFormat = require('dateformat');

function log(msg) {
    console.log(getTime(), msg);
}

function error(e) {
    console.error(getTime(), e);
}

function getTime() {
    let date = new Date;
    return dateFormat(date, "ddd mm/dd/yyyy hh:MM:ssTT -")
}

module.exports.log = log;
module.exports.error = error;