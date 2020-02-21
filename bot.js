const Discord = require('discord.js');
const client = new Discord.Client();
const Timeout = require('smart-timeout');
const logger = require('./logger.js');
const auth = require('./auth.json');
const config = require('./config.json');

let currentNewUsers = 0;
let usersOnProbation = [];
let newMessages = [];
let channels = {}

client.on('ready', () => {
    logger.log(`Logged in as ${client.user.tag}!`);

    channels = {
        "welcome": client.channels.find(channel => channel.name === "welcome"),
        "notify": client.channels.find(channel => channel.name === "server-logs"),
        "linkshare": client.channels.find(channel => channel.name === "invite-link"),
        "qrrequests": client.channels.find(channel => channel.name === "qr-requests"),
        "techsupport": client.channels.find(channel => channel.name === "tech-support")
    }
});

client.on('guildMemberAdd', async member => {
    logger.log(`Setting initial role for ${member.displayName}`)

    setProbation(member);

    try {
        member.setRoles([config.roles.first])
        logger.log(`Successfully set the initial role for ${member.displayName}`)

        let dm = await member.createDM()
        await dm.send(config.dmJoinText)
    } catch (e) {
        logger.error(e);
    }

    currentNewUsers++;
    Timeout.clear("inviteLeakTimeout");
    Timeout.set("inviteLeakTimeout", resetCounter, config.inviteLeakTime);

    if (currentNewUsers >= config.maxNewUsers) {
        detectedLeak();
    }
});

async function removeProbation(member) {
    try {
        logger.log(`Removing probation role for '${member.displayName}'...`);

        await member.setRoles([config.roles.second]);

        logger.log("Role change success!");
        logger.log(`Attempting to send DM to '${member.displayName}'...`);

        let dm = await member.createDM()
        await dm.send("Congratulations! You've been granted access to the rest of the server. 😊 Enjoy your stay!")

        logger.log("DM success!");
    } catch (e) {
        if (e.code == 50007) {
            logger.log("User does not accept DMs. Skipping.")
        } else {
            logger.error(e);
        }
    }
}

async function detectedLeak() {
    resetCounter()
    Timeout.clear("inviteLeakTimeout");

    try {
        let invites = await channels.welcome.fetchInvites();
        await invites.deleteAll();

        let messages = await channels.linkshare.fetchMessages(channels.linkshare);
        messages.array().forEach(function(m) {
            m.delete();
        });

        let invite = await channels.welcome.createInvite({ "maxAge": 0 }, "Detected leak of original link");
        await channels.linkshare.send(config.inviteMessage + invite.toString())
        await channels.notify.send("Detected invite leak!! New link: " + invite.toString())
    } catch (e) {
        logger.error(e);
    }
}

function loop() {
    let currTime = Date.now();

    usersOnProbation.forEach(function(m, i) {
        let diff = currTime - m.joinTime;
        if (diff >= config.newUserProbationTime) {
            logger.log(`Removing probation from ${m.member.displayName}, join date older than ${config.newUserProbationTime}ms.`);
            usersOnProbation.splice(i, 1); //remove user from array
            removeProbation(m.member);
            logger.log(`Users left in array: ${usersOnProbation.length}`)
        }
    });

    currTime = Date.now();
    newMessages.forEach(function(m, i) {
        let diff = currTime - m.time;

        if (diff >= config.newMessageDeleteTime) {
            m.message.delete()
                .catch(function(e) {
                    if (e.message !== "Unknown Message") {
                        logger.error(e);
                    }
                });

            newMessages.splice(i, 1);
        }
    });

    setTimeout(loop, 2000);
}

function setProbation(member) {
    if (!member) {
        member = String.fromCharCode(rand(65, 122)); //rand char for testing
    }

    logger.log(`Setting probation for ${member.displayName || member}`);

    usersOnProbation.push({ "member": member, "joinTime": Date.now() });
}

function resetCounter() {
    currentNewUsers = 0;
}


client.on('message', async message => {
    if (message.channel.name == "qr-bot-search") {
        if (!message.content.match(/^!qre|^\d*$|^cancel$/g) && !message.member.user.bot) {
            await message.delete()
            message.channel.send(`<@${message.author.id}> this channel is for commands only. If you are having trouble installing a code, please visit ${channels.techsupport}. If your code does not exist, you can request it in ${channels.qrrequests}.`)
        }

        //push messages to delete later
        newMessages.push({ "message": message, "time": Date.now() });
    }

    //test code, only works on test server
    if (message.content == ".fakejoin" && message.channel.name == "test-invite-leaked") {
        currentNewUsers++;
        Timeout.clear("inviteLeakTimeout");
        Timeout.set("inviteLeakTimeout", resetCounter, config.inviteLeakTime);

        if (currentNewUsers >= config.maxNewUsers) {
            detectedLeak();
        }
    }
});

loop();
client.login(auth.token);