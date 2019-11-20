//todo: prevent messages inside #qr-bot-search


const Discord = require('discord.js');
const client = new Discord.Client();
const auth = require('./auth.json');
const Timeout = require('smart-timeout');

let roles = {
    "firstjoined": "646165492788232213", //ID of role to first assign to users
    "after10mins": "646165580210110487" //ID of role to change after the alloted time
}

let channels = {}

let probationPeriod = 600000; // time until users get access to the rest of the server 10 mins
let newUserLimit = 30;
let newUserTime = 600000; //ms

let message = "Below is the link to the server, feel free to share it with your friends.\nDO NOT POST THIS PUBLICLY, ESPECIALLY ON REDDIT. SHARE ONLY THROUGH PRIVATE MESSAGES.\n\n";

//----------------------------------- END CONFIG -----------------------------------

let currentNewUsers = 0;

client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);

    channels = {
        "welcome": client.channels.find(channel => channel.name === "welcome"),
        "notify": client.channels.find(channel => channel.name === "server-logs"),
        "linkshare": client.channels.find(channel => channel.name === "invite-link")
    }
});

client.on('guildMemberAdd', member => {
    member.setRoles([roles.firstjoined]).catch(console.error);
    Timeout.set(initiateUser, probationPeriod, member);

    currentNewUsers++;
    Timeout.clear("newUserTimeout");
    Timeout.set("newUserTimeout", resetCounter, newUserTime);

    if (currentNewUsers >= newUserLimit) {
        detectedLeak();
    }
});

//test code, disable when live into guildMemberAdd above when live
client.on('message', message => {
    if (message.content == ".fakejoin") {
        currentNewUsers++;
        Timeout.clear("newUserTimeout");
        Timeout.set("newUserTimeout", resetCounter, newUserTime);

        if (currentNewUsers >= newUserLimit) {
            detectedLeak();
        }
    }
});

function initiateUser(member) {
    member.setRoles([roles.after10mins]).catch(console.error);
    member.createDM()
        .then(function(dm) {
            dm.send("Congrats! You've been granted access to the rest of the qreeShop server. 😊 Enjoy your stay!")
        });
}

function resetCounter() {
    currentNewUsers = 0;
}

function detectedLeak() {
    resetCounter()
    Timeout.clear("newUserTimeout");

    channels.welcome.fetchInvites()
        .then(function(invites) {
            invites.deleteAll();

            channels.welcome.createInvite({ "maxAge": 0 }, "Detected leak of original link")
                .then(function(invite) {
                    channels.linkshare.fetchMessages(channels.linkshare)
                        .then(messages => messages.array()[0].delete())
                        .then(channels.linkshare.send(message + invite.toString()))
                        .then(channels.notify.send("Detected invite leak!! New link: " + invite.toString()))
                }).catch(console.error);
        }).catch(console.error);
}

client.login(auth.token);