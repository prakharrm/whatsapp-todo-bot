const db = require('./database');

class CommandHandler {
    constructor(client) {
        this.client = client;
    }

    async handle(message) {
        const chat = await message.getChat();
        
        // Only process group messages
        if (!chat.isGroup) {
            return;
        }

        const command = message.body.toLowerCase().trim();
        const sender = message.author || message.from;
        const contact = await message.getContact();
        const senderName = contact.pushname || contact.name || sender.split('@')[0];

        // Command routing
        if (command === '!help' || command === '!commands') {
            await this.sendHelp(message);
            return;
        }

        if (command.startsWith('!addtask')) {
            await this.addTask(message, sender, senderName);
            return;
        }

        if (command.startsWith('!vote')) {
            await this.voteTask(message, sender);
            return;
        }

        if (command.startsWith('!unvote')) {
            await this.removeVote(message, sender);
            return;
        }

        if (command === '!mytasks') {
            await this.showMyTasks(message, sender);
            return;
        }

        if (command === '!alltasks') {
            await this.showAllTasks(message);
            return;
        }

        if (command === '!priority') {
            await this.showTasksByPriority(message);
            return;
        }

        if (command.startsWith('!complete')) {
            await this.completeTask(message, sender);
            return;
        }

        if (command.startsWith('!delete')) {
            await this.deleteTask(message, sender);
            return;
        }

        if (command === '!stats' || command.startsWith('!stats ')) {
            await this.showStats(message, sender);
            return;
        }

        if (command === '!leaderboard') {
            await this.showLeaderboard(message);
            return;
        }

        if (command === '!streak' || command.startsWith('!streak ')) {
            await this.showStreak(message, sender);
            return;
        }

        if (command === '!deadlines') {
            await this.showDeadlines(message);
            return;
        }

        if (command.startsWith('!tag')) {
            await this.addTaskTag(message);
            return;
        }

        if (command.startsWith('!filter')) {
            await this.filterByTag(message);
            return;
        }

        if (command === '!history') {
            await this.showHistory(message);
            return;
        }

        if (command === '!motivate') {
            await this.sendMotivation(message);
            return;
        }

        if (command === '!ping') {
            await message.reply('🏓 Pong! Bot is active.');
            return;
        }
    }

    async sendHelp(message) {
        const helpText = `
🤖 *Task Management Bot - Commands*

📝 *Create Tasks:*
• *!addtask [description]* - Create task for yourself
• *!addtask @user [description]* - Assign to user
• *!addtask "Task" 2d* - With 2-day deadline

📋 *View Tasks:*
• *!mytasks* - Your tasks
• *!alltasks* - All tasks
• *!priority* - Tasks by votes
• *!deadlines* - Tasks by deadline
• *!history* - Completed tasks

✅ *Manage Tasks:*
• *!complete [TaskID]* - Mark completed
• *!delete [TaskID]* - Delete task
• *!tag [TaskID] [tag]* - Add tag
• *!filter [tag]* - Filter by tag

👍 *Voting:*
• *!vote [TaskID]* - Vote (boost priority)
• *!unvote [TaskID]* - Remove vote

📊 *Stats & Fun:*
• *!stats* - Your statistics
• *!stats @user* - User statistics
• *!streak* - Your completion streak
• *!leaderboard* - Top contributors
• *!motivate* - Get motivated!

⏰ *Auto-Reminders:*
Tasks sent every 1.5 hours automatically

💡 *Examples:*
\`!addtask Buy groceries\`
\`!addtask @John Review code 1d\`
\`!tag T1729012345678 urgent\`
\`!filter urgent\`

_Made with ❤️ for productivity_
        `.trim();

        await message.reply(helpText);
    }

    async addTask(message, sender, senderName) {
        try {
            let taskText = message.body.substring(9).trim();
            
            if (!taskText) {
                await message.reply('❌ Usage: !addtask Task description\nExample: !addtask Buy groceries 2d');
                return;
            }

            // Check for mentions
            const mentions = await message.getMentions();
            let targetUser = sender;
            let targetName = senderName;

            if (mentions.length > 0) {
                targetUser = mentions[0].id._serialized;
                targetName = mentions[0].pushname || mentions[0].name || targetUser.split('@')[0];
                taskText = taskText.replace(/@[\w]+/g, '').trim();
            }

            // Parse deadline (e.g., "2d", "3h", "1w")
            let deadline = null;
            const deadlineMatch = taskText.match(/\s+(\d+)([hdw])$/i);
            
            if (deadlineMatch) {
                const value = parseInt(deadlineMatch[1]);
                const unit = deadlineMatch[2].toLowerCase();
                
                const now = new Date();
                if (unit === 'h') {
                    now.setHours(now.getHours() + value);
                } else if (unit === 'd') {
                    now.setDate(now.getDate() + value);
                } else if (unit === 'w') {
                    now.setDate(now.getDate() + (value * 7));
                }
                deadline = now.toISOString();
                taskText = taskText.replace(/\s+\d+[hdw]$/i, '').trim();
            }

            // Remove quotes
            taskText = taskText.replace(/^["'](.*)["']$/, '$1');

            const task = db.addTask(targetUser, taskText, sender, deadline);
            db.updateUserStats(sender, 'tasksCreated');

            let response = `✅ *Task Added Successfully!*\n\n`;
            response += `👤 Assigned to: ${targetName}\n`;
            response += `🆔 Task ID: \`${task.id}\`\n`;
            response += `📝 Description: ${taskText}\n`;
            response += `👨‍💼 Created by: ${senderName}\n`;
            
            if (deadline) {
                const deadlineDate = new Date(deadline);
                response += `⏰ Deadline: ${deadlineDate.toLocaleString()}\n`;
            }
            
            response += `📅 Date: ${new Date().toLocaleString()}\n\n`;
            response += `_Use \`!vote ${task.id}\` to increase priority_`;

            await message.reply(response);
        } catch (error) {
            console.error('Error adding task:', error);
            await message.reply('❌ Error adding task. Please try again.');
        }
    }

    async voteTask(message, sender) {
        try {
            const taskId = message.body.split(' ')[1];

            if (!taskId) {
                await message.reply('❌ Usage: !vote [TaskID]\nExample: !vote T1729012345678');
                return;
            }

            const result = db.vote(taskId, sender);

            if (!result.success) {
                if (result.message === 'Task not found') {
                    await message.reply('❌ Task not found! Use !alltasks to see available tasks.');
                } else {
                    await message.reply('⚠️ You have already voted for this task!');
                }
                return;
            }

            db.updateUserStats(sender, 'votesGiven');

            const emoji = result.count >= 5 ? '🔥' : result.count >= 3 ? '⚡' : '👍';
            await message.reply(`✅ Vote recorded!\n📊 Total votes: *${result.count}* ${emoji}`);
        } catch (error) {
            console.error('Error voting:', error);
            await message.reply('❌ Error recording vote.');
        }
    }

    async removeVote(message, sender) {
        try {
            const taskId = message.body.split(' ')[1];

            if (!taskId) {
                await message.reply('❌ Usage: !unvote [TaskID]');
                return;
            }

            const result = db.removeVote(taskId, sender);

            if (!result.success) {
                await message.reply('❌ ' + result.message);
                return;
            }

            await message.reply(`✅ Vote removed!\n📊 Current votes: *${result.count}* 👍`);
        } catch (error) {
            console.error('Error removing vote:', error);
            await message.reply('❌ Error removing vote.');
        }
    }

    async showMyTasks(message, sender) {
        try {
            const tasks = db.getTasks(sender);
            const contact = await message.getContact();
            const userName = contact.pushname || contact.name || sender.split('@')[0];

            const pendingTasks = tasks.filter(t => t.status === 'pending');

            if (pendingTasks.length === 0) {
                await message.reply('📋 You have no pending tasks! 🎉\n\n_Use !addtask to create one_');
                return;
            }

            let taskList = `📋 *Tasks for ${userName}:*\n\n`;

            pendingTasks.forEach((task, index) => {
                const votes = db.getVotes(task.id);
                const priority = votes.count >= 5 ? '🔴' : votes.count >= 3 ? '🟡' : '🟢';
                
                taskList += `${index + 1}. ${priority} *${task.description}*\n`;
                taskList += `   🆔 \`${task.id}\`\n`;
                taskList += `   👍 ${votes.count} votes\n`;
                
                if (task.deadline) {
                    const deadline = new Date(task.deadline);
                    const now = new Date();
                    const hoursUntil = Math.floor((deadline - now) / (1000 * 60 * 60));
                    
                    if (hoursUntil < 0) {
                        taskList += `   ⚠️ OVERDUE by ${Math.abs(hoursUntil)}h\n`;
                    } else if (hoursUntil < 24) {
                        taskList += `   ⏰ ${hoursUntil}h remaining\n`;
                    } else {
                        taskList += `   📅 ${Math.floor(hoursUntil / 24)}d remaining\n`;
                    }
                }
                
                if (task.tags && task.tags.length > 0) {
                    taskList += `   🏷️ ${task.tags.join(', ')}\n`;
                }
                
                taskList += `\n`;
            });

            await message.reply(taskList);
        } catch (error) {
            console.error('Error showing tasks:', error);
            await message.reply('❌ Error fetching tasks.');
        }
    }

    async showAllTasks(message) {
        try {
            const allTasks = db.getAllTasks();
            let taskList = '📊 *All Active Tasks:*\n\n';
            let taskCount = 0;

            for (const userId in allTasks) {
                const userTasks = allTasks[userId].filter(t => t.status === 'pending');
                
                if (userTasks.length > 0) {
                    const contact = await this.client.getContactById(userId);
                    const userName = contact.pushname || contact.name || userId.split('@')[0];
                    
                    taskList += `👤 *${userName}:*\n`;
                    
                    userTasks.forEach(task => {
                        const votes = db.getVotes(task.id);
                        const priority = votes.count >= 5 ? '🔴' : votes.count >= 3 ? '🟡' : '🟢';
                        
                        taskList += `  ${priority} ${task.description}\n`;
                        taskList += `    🆔 \`${task.id}\` | 👍 ${votes.count}\n`;
                        taskCount++;
                    });
                    
                    taskList += '\n';
                }
            }

            if (taskCount === 0) {
                await message.reply('📋 No active tasks! Everyone is free! 🎉');
                return;
            }

            taskList += `_Total: ${taskCount} task${taskCount > 1 ? 's' : ''}_`;
            await message.reply(taskList);
        } catch (error) {
            console.error('Error showing all tasks:', error);
            await message.reply('❌ Error fetching tasks.');
        }
    }

    async showTasksByPriority(message) {
        try {
            const allTasks = db.getAllTasks();
            const taskArray = [];

            for (const userId in allTasks) {
                for (const task of allTasks[userId]) {
                    if (task.status === 'pending') {
                        const votes = db.getVotes(task.id);
                        const contact = await this.client.getContactById(userId);
                        const userName = contact.pushname || contact.name || userId.split('@')[0];
                        
                        taskArray.push({
                            ...task,
                            userId,
                            userName,
                            voteCount: votes.count
                        });
                    }
                }
            }

            if (taskArray.length === 0) {
                await message.reply('📋 No active tasks!');
                return;
            }

            taskArray.sort((a, b) => b.voteCount - a.voteCount);

            let taskList = '🏆 *Tasks by Priority (Votes):*\n\n';

            taskArray.forEach((task, index) => {
                const emoji = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '📌';
                taskList += `${emoji} *${task.userName}* - ${task.description}\n`;
                taskList += `   🆔 \`${task.id}\` | 👍 ${task.voteCount} votes\n\n`;
            });

            await message.reply(taskList);
        } catch (error) {
            console.error('Error showing priority tasks:', error);
            await message.reply('❌ Error fetching tasks.');
        }
    }

    async completeTask(message, sender) {
        try {
            const taskId = message.body.split(' ')[1];

            if (!taskId) {
                await message.reply('❌ Usage: !complete [TaskID]');
                return;
            }

            const result = db.completeTask(taskId);

            if (!result.success) {
                await message.reply('❌ Task not found!');
                return;
            }

            db.updateUserStats(sender, 'tasksCompleted');
            
            const streak = db.getStreak(sender);
            let response = '✅ *Task Completed!* 🎉\n\n';
            response += `📝 ${result.task.description}\n\n`;
            
            if (streak.current > 1) {
                response += `🔥 *${streak.current}-day streak!* Keep it up!\n`;
            }
            
            response += `_+10 points earned!_`;

            await message.reply(response);
        } catch (error) {
            console.error('Error completing task:', error);
            await message.reply('❌ Error completing task.');
        }
    }

    async deleteTask(message, sender) {
        try {
            const taskId = message.body.split(' ')[1];

            if (!taskId) {
                await message.reply('❌ Usage: !delete [TaskID]');
                return;
            }

            const success = db.deleteTask(taskId);

            if (!success) {
                await message.reply('❌ Task not found!');
                return;
            }

            await message.reply('✅ Task deleted successfully!');
        } catch (error) {
            console.error('Error deleting task:', error);
            await message.reply('❌ Error deleting task.');
        }
    }

    async showStats(message, sender) {
        try {
            let targetUser = sender;
            const mentions = await message.getMentions();
            
            if (mentions.length > 0) {
                targetUser = mentions[0].id._serialized;
            }

            const stats = db.getUserStats(targetUser);
            const streak = db.getStreak(targetUser);
            const contact = await this.client.getContactById(targetUser);
            const userName = contact.pushname || contact.name || targetUser.split('@')[0];

            const response = `
📊 *Statistics for ${userName}:*

📝 Tasks Created: ${stats.tasksCreated}
✅ Tasks Completed: ${stats.tasksCompleted}
👍 Votes Given: ${stats.votesGiven}
⭐ Total Points: ${stats.totalPoints}

🔥 Current Streak: ${streak.current} day${streak.current !== 1 ? 's' : ''}
🏆 Longest Streak: ${streak.longest} day${streak.longest !== 1 ? 's' : ''}

_Keep crushing it!_ 💪
            `.trim();

            await message.reply(response);
        } catch (error) {
            console.error('Error showing stats:', error);
            await message.reply('❌ Error fetching statistics.');
        }
    }

    async showLeaderboard(message) {
        try {
            const userStats = db.data.userStats;
            const leaderboard = [];

            for (const userId in userStats) {
                const contact = await this.client.getContactById(userId);
                const userName = contact.pushname || contact.name || userId.split('@')[0];
                
                leaderboard.push({
                    name: userName,
                    ...userStats[userId]
                });
            }

            leaderboard.sort((a, b) => b.totalPoints - a.totalPoints);

            let response = '🏆 *Leaderboard - Top Contributors:*\n\n';

            leaderboard.slice(0, 10).forEach((user, index) => {
                const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
                response += `${medal} *${user.name}* - ${user.totalPoints} pts\n`;
                response += `   ✅ ${user.tasksCompleted} completed | `;
                response += `📝 ${user.tasksCreated} created\n\n`;
            });

            await message.reply(response);
        } catch (error) {
            console.error('Error showing leaderboard:', error);
            await message.reply('❌ Error fetching leaderboard.');
        }
    }

    async showStreak(message, sender) {
        try {
            let targetUser = sender;
            const mentions = await message.getMentions();
            
            if (mentions.length > 0) {
                targetUser = mentions[0].id._serialized;
            }

            const streak = db.getStreak(targetUser);
            const contact = await this.client.getContactById(targetUser);
            const userName = contact.pushname || contact.name || targetUser.split('@')[0];

            let response = `🔥 *Completion Streak for ${userName}:*\n\n`;
            response += `Current: ${streak.current} day${streak.current !== 1 ? 's' : ''}\n`;
            response += `Longest: ${streak.longest} day${streak.longest !== 1 ? 's' : ''}\n\n`;
            
            if (streak.current >= 7) {
                response += `🔥🔥🔥 *LEGENDARY!* Keep it up!\n`;
            } else if (streak.current >= 3) {
                response += `⚡ *On fire!* Don't break it!\n`;
            } else if (streak.current >= 1) {
                response += `💪 Good start! Keep going!\n`;
            } else {
                response += `📝 Complete a task to start your streak!\n`;
            }

            await message.reply(response);
        } catch (error) {
            console.error('Error showing streak:', error);
            await message.reply('❌ Error fetching streak.');
        }
    }

    async showDeadlines(message) {
        try {
            const tasks = db.getTasksByDeadline();

            if (tasks.length === 0) {
                await message.reply('📅 No tasks with deadlines!');
                return;
            }

            let response = '⏰ *Tasks by Deadline:*\n\n';

            tasks.forEach( async (task, index) => {
                const contact = await this.client.getContactById(task.userId);
                const userName = contact.pushname || contact.name || task.userId.split('@')[0];
                
                const emoji = task.overdue ? '🔴' : task.hoursUntil < 24 ? '🟡' : '🟢';
                response += `${emoji} *${userName}* - ${task.description}\n`;
                response += `   🆔 \`${task.id}\`\n`;
                
                if (task.overdue) {
                    response += `   ⚠️ OVERDUE by ${Math.abs(Math.floor(task.hoursUntil))}h\n\n`;
                } else if (task.hoursUntil < 24) {
                    response += `   ⏰ ${Math.floor(task.hoursUntil)}h remaining\n\n`;
                } else {
                    response += `   📅 ${Math.floor(task.hoursUntil / 24)}d remaining\n\n`;
                }
            });

            await message.reply(response);
        } catch (error) {
            console.error('Error showing deadlines:', error);
            await message.reply('❌ Error fetching deadlines.');
        }
    }

    async addTaskTag(message) {
        try {
            const parts = message.body.split(' ');
            
            if (parts.length < 3) {
                await message.reply('❌ Usage: !tag [TaskID] [tag]\nExample: !tag T1729012345678 urgent');
                return;
            }

            const taskId = parts[1];
            const tag = parts[2].toLowerCase();

            const success = db.addTag(taskId, tag);

            if (success) {
                await message.reply(`✅ Tag "${tag}" added to task!`);
            } else {
                await message.reply('❌ Task not found or tag already exists!');
            }
        } catch (error) {
            console.error('Error adding tag:', error);
            await message.reply('❌ Error adding tag.');
        }
    }

    async filterByTag(message) {
        try {
            const tag = message.body.split(' ')[1];

            if (!tag) {
                await message.reply('❌ Usage: !filter [tag]\nExample: !filter urgent');
                return;
            }

            const tasks = db.getTasksByTag(tag.toLowerCase());

            if (tasks.length === 0) {
                await message.reply(`📋 No tasks found with tag "${tag}"`);
                return;
            }

            let response = `🏷️ *Tasks tagged "${tag}":*\n\n`;

            for (const task of tasks) {
                const contact = await this.client.getContactById(task.userId);
                const userName = contact.pushname || contact.name || task.userId.split('@')[0];
                const votes = db.getVotes(task.id);

                response += `• *${userName}* - ${task.description}\n`;
                response += `  🆔 \`${task.id}\` | 👍 ${votes.count}\n\n`;
            }

            await message.reply(response);
        } catch (error) {
            console.error('Error filtering tasks:', error);
            await message.reply('❌ Error filtering tasks.');
        }
    }

    async showHistory(message) {
        try {
            const history = db.data.taskHistory.slice(-10).reverse();

            if (history.length === 0) {
                await message.reply('📜 No completed tasks yet!');
                return;
            }

            let response = '📜 *Recently Completed Tasks:*\n\n';

            for (const task of history) {
                const contact = await this.client.getContactById(task.userId);
                const userName = contact.pushname || contact.name || task.userId.split('@')[0];
                const completedDate = new Date(task.completedAt).toLocaleDateString();

                response += `✅ *${userName}* - ${task.description}\n`;
                response += `   📅 ${completedDate}\n\n`;
            }

            await message.reply(response);
        } catch (error) {
            console.error('Error showing history:', error);
            await message.reply('❌ Error fetching history.');
        }
    }

    async sendMotivation(message) {
        const quotes = [
            "🚀 *Keep pushing!* Every task completed is a step towards success!",
            "💪 *You got this!* Small progress is still progress!",
            "⚡ *Stay focused!* Great things take time and effort!",
            "🔥 *On fire!* Your dedication is inspiring!",
            "🌟 *Believe in yourself!* You're capable of amazing things!",
            "🎯 *Stay on target!* Consistency beats perfection!",
            "💎 *You're a gem!* Keep shining and completing tasks!",
            "🏆 *Champion mindset!* Every completed task is a win!",
            "🌈 *Bright future ahead!* Your hard work will pay off!",
            "⭐ *You're unstoppable!* Keep that momentum going!"
        ];

        const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];
        await message.reply(randomQuote);
    }
}

module.exports = CommandHandler;
