const Discord = require('discord.js');
const client = new Discord.Client();
const Timeout = require('smart-timeout');
const convertTime = require('convert-time');
const parseCommandInput = require('chat-arg-parser');
const logger = require('./logger.js');
const auth = require('./auth.json');
const config = require('./config.json');

let currentNewUsers = 0;
let usersOnProbation = [];
let newMessages = [];
let channels = {};
let gameNight = { "message": null, "ping": null, "details": { "coordinator": null, "game": null, "console": null, "time": null, "date": null }, "users": [] };

client.on('ready', () => {
    logger.log(`Logged in as ${client.user.tag}!`);

    channels = {
        "welcome": client.channels.find(channel => channel.name === "welcome"),
        "notify": client.channels.find(channel => channel.name === "server-logs"),
        "linkshare": client.channels.find(channel => channel.name === "invite-link"),
        "qrrequests": client.channels.find(channel => channel.name === "qr-requests"),
        "techsupport": client.channels.find(channel => channel.name === "tech-support")
    }

    //channels.notify.send("I had to reboot. Any scheduled game nights will have to be re-added. Also check for uses stuck in purgatory.")
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

    currTime = Date.now();
    if (gameNight.details.date !== null && currTime >= gameNight.details.date.getTime()) {
        gameNight.users.forEach(async user => {
            let dm = await user.createDM()
            await dm.send(`It's time! <@${gameNight.details.coordinator}> should be ready to play ${gameNight.details.game} with you. Check the discord for any updates, or shoot them a message. Happy gaming!`)
            clearGameNight();
        });
    }

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

client.on("messageReactionAdd", async (reaction, user) => {
    if (user.bot) return;

    let dm = await user.createDM()

    if (gameNight.message !== null && reaction.message.id == gameNight.message.id) {
        await dm.send(`Got it! I will remind you about ${gameNight.details.game} at ${convertTime(gameNight.details.time)} EST 🙂`)
        gameNight.users.push(user);
    } else if (gameNight.message == null && reaction._emoji.name == "🎮" && reaction.message.channel.name == "game-and-movie-night") {
        //this doesn't behave how i want. i will fix it later
        //dm.send(`Sorry, that scheduled Game Night doesn't exist anymore. Turn on discord notifications so you'll know for next time!`)
    }
});

function clearGameNight() {
    gameNight = { "message": null, "ping": null, "details": { "coordinator": null, "game": null, "console": null, "time": null, "date": null }, "users": [] };
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


    let command = parseCommandInput("!", message.content)

    //this really shouldn't be hardcoded, but I didn't want to refactor the entire bot for 1 command
    if (command.cmd == "gamenight") {
        if (gameNight.message) {
            message.channel.send(`A Game Night already exists. Clearing old event and making a new one.`);
            clearGameNight();
        }

        if (message.member.roles.find(role => role.name === "Coordinator")) {
            if (command.args.length == 3 && command.args[2].match(/^\d\d:\d\d$/)) {
                gameNight.details.coordinator = message.member.user.id;
                gameNight.details.game = command.args[0];
                gameNight.details.console = command.args[1];
                gameNight.details.time = command.args[2];

                gameNight.details.date = new Date(Date().toString().replace(/\d\d:\d\d:\d\d/, gameNight.details.time + ":00"));

                if (gameNight.details.date.getTime() <= Date.now()) {
                    message.channel.send(`Error: I can't set a reminder for a time that's already passed! Current EST time: ${Date()}`);
                    clearGameNight();
                    return;
                } else if (gameNight.details.time.split(":")[0] > 24 || gameNight.details.time.split(":")[0] < 0) {
                    message.channel.send(`Error: Invalid time. Time must be a number between 0 and 24.`);
                    clearGameNight();
                    return;
                }

                let embed = {
                    "embed": {
                        "title": "Game Night",
                        "description": "\nWe are having a Game Night tonight! React with a 🎮 if you'd like to play!",
                        "fields": [{
                            "name": "**Game**",
                            "value": `${gameNight.details.game}`,
                            "inline": true
                        }, {
                            "name": "**Console**",
                            "value": `${gameNight.details.console}`,
                            "inline": true
                        }, {
                            "name": "**Coordinator**",
                            "value": `<@${gameNight.details.coordinator}>`,
                            "inline": true
                        }, {
                            "name": "**Time**",
                            "value": `${convertTime(gameNight.details.time)} EST [Click to get your local time!](https://www.thetimezoneconverter.com/?t=${encodeURI(convertTime(gameNight.details.time)).replace(":", "%3A")}&tz=EST%20%28Eastern%20Standard%20Time%29&)`
                        }, {
                            "name": "**Important**",
                            "value": "Make sure you allow DMs from other users! I will send you a message at the scheduled time."
                        }],
                        "footer": {
                            "text": "botman 🦇 - Use !cancelgamenight to cancel the event. "
                        }
                    }
                }

                //gameNight.ping = message.channel.send("@here");
                gameNight.message = await message.channel.send(embed);
                gameNight.message.react("🎮");
            } else {
                message.channel.send(`Sorry, I didn't understand your command. Syntax: \`!gamenight <game> <console> <HH:MM>\`. Times are 24 hour format and in EST`)
            }
        } else {
            message.channel.send("Sorry, you do not have permission for this command.");
        }
    } else if (command.cmd == "cancelgamenight") {
        if (message.member.roles.find(role => role.name === "Coordinator")) {
            gameNight.message.delete();
            clearGameNight();
            message.channel.send("I've cancelled the event.");
        } else {
            message.channel.send("Sorry, you do not have permission for this command.");
        }
    }
});

loop();
client.login(auth.token);