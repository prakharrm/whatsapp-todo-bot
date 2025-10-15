require('dotenv').config();
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const cron = require('node-cron');
const CommandHandler = require('./commands');
const db = require('./database');

console.log('🚀 Starting WhatsApp Task Bot...\n');

const client = new Client({
    authStrategy: new LocalAuth({
        dataPath: './.wwebjs_auth'
    }),
    puppeteer: {
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-gpu'
        ]
    }
});

const commandHandler = new CommandHandler(client);

client.on('qr', (qr) => {
    console.log('📱 QR CODE RECEIVED');
    console.log('Scan this QR code with WhatsApp:\n');
    qrcode.generate(qr, { small: true });
    console.log('\n⏳ Waiting for scan...');
});

client.on('authenticated', () => {
    console.log('✅ Authentication successful!');
});

client.on('auth_failure', (msg) => {
    console.error('❌ Authentication failed:', msg);
});

client.on('ready', async () => {
    console.log('\n✅ Bot is ready and running!');
    console.log('📱 Connected to WhatsApp');
    console.log('⏰ Time:', new Date().toLocaleString());
    console.log('\n📋 Listening for commands...\n');

    const info = client.info;
    console.log(`👤 Bot Number: ${info.wid.user}`);
    console.log(`📛 Bot Name: ${info.pushname}\n`);
});

client.on('message_create', async (message) => {
    try {
        if (!message.body.startsWith('!')) return;

        const chat = await message.getChat();
        
        if (!chat.isGroup) {
            await message.reply('⚠️ This bot only works in groups!');
            return;
        }

        const sender = message.author || message.from;
        console.log(`📨 Command: ${message.body} from ${sender}`);

        await commandHandler.handle(message);
    } catch (error) {
        console.error('❌ Error handling message:', error);
    }
});

client.on('disconnected', (reason) => {
    console.log('❌ Disconnected:', reason);
    console.log('🔄 Reconnecting...');
});

// Task reminder every 90 minutes (1.5 hours)
cron.schedule('*/90 * * * *', async () => {
    try {
        console.log('⏰ Sending task reminders...');
        
        const allTasks = db.getAllTasks();
        const chats = await client.getChats();
        const targetGroups = chats.filter(c => c.isGroup);

        if (targetGroups.length === 0) return;

        for (const userId in allTasks) {
            const pendingTasks = allTasks[userId].filter(t => t.status === 'pending');
            
            if (pendingTasks.length > 0) {
                try {
                    const contact = await client.getContactById(userId);
                    const userName = contact.pushname || contact.name || userId.split('@')[0];

                    let reminder = `⏰ *Task Reminder for ${userName}*\n\n`;
                    reminder += `You have ${pendingTasks.length} pending task${pendingTasks.length > 1 ? 's' : ''}:\n\n`;

                    pendingTasks.forEach((task, index) => {
                        const votes = db.getVotes(task.id);
                        reminder += `${index + 1}. ${task.description}\n`;
                        reminder += `   🆔 \`${task.id}\` | 👍 ${votes.count}\n`;
                        
                        if (task.deadline) {
                            const deadline = new Date(task.deadline);
                            const now = new Date();
                            const hoursUntil = Math.floor((deadline - now) / (1000 * 60 * 60));
                            
                            if (hoursUntil < 0) {
                                reminder += `   ⚠️ OVERDUE!\n`;
                            } else if (hoursUntil < 24) {
                                reminder += `   ⏰ ${hoursUntil}h left\n`;
                            }
                        }
                        
                        reminder += `\n`;
                        db.incrementReminder(task.id);
                    });

                    reminder += `_Use !complete [TaskID] when done_\n`;
                    reminder += `_Next reminder in 1.5 hours_`;

                    // Send to first group only
                    await targetGroups[0].sendMessage(reminder);
                    await new Promise(resolve => setTimeout(resolve, 3000));
                } catch (err) {
                    console.error(`Error sending reminder:`, err);
                }
            }
        }
    } catch (error) {
        console.error('Error in reminder cron:', error);
    }
});

// Daily motivation at 9 AM
cron.schedule('0 9 * * *', async () => {
    try {
        console.log('🌅 Sending morning motivation...');
        
        const allTasks = db.getAllTasks();
        let totalPending = 0;

        for (const userId in allTasks) {
            totalPending += allTasks[userId].filter(t => t.status === 'pending').length;
        }

        const chats = await client.getChats();
        const groups = chats.filter(c => c.isGroup);

        for (const group of groups) {
            let message = `🌅 *Good Morning, Team!*\n\n`;
            
            if (totalPending > 0) {
                message += `📋 There are *${totalPending}* pending tasks today.\n`;
                message += `Use *!alltasks* to view them.\n\n`;
            } else {
                message += `🎉 No pending tasks! Great job!\n\n`;
            }
            
            message += `💪 _Let's make today productive!_\n`;
            message += `Type *!motivate* for inspiration!`;

            await group.sendMessage(message);
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    } catch (error) {
        console.error('Error sending morning message:', error);
    }
});

// Deadline checker every hour
cron.schedule('0 * * * *', async () => {
    try {
        console.log('⏰ Checking deadlines...');
        
        const tasks = db.getTasksByDeadline();
        const urgentTasks = tasks.filter(t => !t.overdue && t.hoursUntil < 24 && t.hoursUntil > 0);

        if (urgentTasks.length > 0) {
            const chats = await client.getChats();
            const groups = chats.filter(c => c.isGroup);

            for (const group of groups) {
                let alert = `⚠️ *Deadline Alert!*\n\n`;
                alert += `${urgentTasks.length} task${urgentTasks.length > 1 ? 's' : ''} due within 24 hours:\n\n`;

                for (const task of urgentTasks) {
                    const contact = await client.getContactById(task.userId);
                    const userName = contact.pushname || contact.name || task.userId.split('@')[0];
                    
                    alert += `🔔 *${userName}* - ${task.description}\n`;
                    alert += `   ⏰ ${Math.floor(task.hoursUntil)}h remaining\n\n`;
                }

                alert += `_Don't miss these deadlines!_ ⏰`;

                await group.sendMessage(alert);
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
    } catch (error) {
        console.error('Error checking deadlines:', error);
    }
});

process.on('unhandledRejection', (error) => {
    console.error('❌ Unhandled rejection:', error);
});

process.on('uncaughtException', (error) => {
    console.error('❌ Uncaught exception:', error);
});

process.on('SIGINT', async () => {
    console.log('\n⚠️ Shutting down...');
    await client.destroy();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n⚠️ SIGTERM received...');
    await client.destroy();
    process.exit(0);
});

client.initialize();
