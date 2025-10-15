const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'tasks.json');

class Database {
    constructor() {
        this.data = {
            tasks: {},
            votes: {},
            userStats: {},
            taskHistory: [],
            streaks: {},
            settings: {
                targetGroup: null,
                admins: [],
                reminderEnabled: true,
                reminderInterval: 90 // minutes
            }
        };
        this.load();
    }

    load() {
        try {
            if (fs.existsSync(DATA_FILE)) {
                const rawData = fs.readFileSync(DATA_FILE, 'utf8');
                this.data = JSON.parse(rawData);
                console.log('✅ Database loaded successfully');
            } else {
                this.save();
                console.log('✅ New database created');
            }
        } catch (error) {
            console.error('❌ Error loading database:', error);
        }
    }

    save() {
        try {
            fs.writeFileSync(DATA_FILE, JSON.stringify(this.data, null, 2));
        } catch (error) {
            console.error('❌ Error saving database:', error);
        }
    }

    addTask(userId, taskDescription, createdBy, deadline = null) {
        const taskId = `T${Date.now()}`;
        
        if (!this.data.tasks[userId]) {
            this.data.tasks[userId] = [];
        }

        const task = {
            id: taskId,
            description: taskDescription,
            createdBy: createdBy,
            createdAt: new Date().toISOString(),
            deadline: deadline,
            status: 'pending',
            priority: 'normal',
            tags: [],
            reminders: 0
        };

        this.data.tasks[userId].push(task);
        this.data.votes[taskId] = { count: 0, voters: [] };
        this.save();
        return task;
    }

    vote(taskId, voterId) {
        if (!this.data.votes[taskId]) {
            return { success: false, message: 'Task not found' };
        }

        if (this.data.votes[taskId].voters.includes(voterId)) {
            return { success: false, message: 'Already voted' };
        }

        this.data.votes[taskId].count += 1;
        this.data.votes[taskId].voters.push(voterId);
        this.save();
        return { 
            success: true, 
            count: this.data.votes[taskId].count 
        };
    }

    removeVote(taskId, voterId) {
        if (!this.data.votes[taskId]) {
            return { success: false, message: 'Task not found' };
        }

        const index = this.data.votes[taskId].voters.indexOf(voterId);
        if (index === -1) {
            return { success: false, message: 'Vote not found' };
        }

        this.data.votes[taskId].count -= 1;
        this.data.votes[taskId].voters.splice(index, 1);
        this.save();
        return { 
            success: true, 
            count: this.data.votes[taskId].count 
        };
    }

    getTasks(userId) {
        return this.data.tasks[userId] || [];
    }

    getAllTasks() {
        return this.data.tasks;
    }

    getVotes(taskId) {
        return this.data.votes[taskId] || { count: 0, voters: [] };
    }

    completeTask(taskId) {
        for (const userId in this.data.tasks) {
            const taskIndex = this.data.tasks[userId].findIndex(t => t.id === taskId);
            if (taskIndex !== -1) {
                const task = this.data.tasks[userId][taskIndex];
                task.status = 'completed';
                task.completedAt = new Date().toISOString();
                
                // Add to history
                this.data.taskHistory.push({
                    ...task,
                    userId: userId
                });

                // Update streak
                this.updateStreak(userId);
                
                this.save();
                return { success: true, task: task };
            }
        }
        return { success: false };
    }

    deleteTask(taskId) {
        for (const userId in this.data.tasks) {
            const taskIndex = this.data.tasks[userId].findIndex(t => t.id === taskId);
            if (taskIndex !== -1) {
                this.data.tasks[userId].splice(taskIndex, 1);
                delete this.data.votes[taskId];
                this.save();
                return true;
            }
        }
        return false;
    }

    updateUserStats(userId, action) {
        if (!this.data.userStats[userId]) {
            this.data.userStats[userId] = {
                tasksCreated: 0,
                tasksCompleted: 0,
                votesGiven: 0,
                totalPoints: 0,
                lastActive: new Date().toISOString()
            };
        }

        this.data.userStats[userId][action] += 1;
        this.data.userStats[userId].lastActive = new Date().toISOString();
        
        // Award points
        const points = {
            tasksCreated: 5,
            tasksCompleted: 10,
            votesGiven: 2
        };
        
        if (points[action]) {
            this.data.userStats[userId].totalPoints += points[action];
        }
        
        this.save();
    }

    getUserStats(userId) {
        return this.data.userStats[userId] || {
            tasksCreated: 0,
            tasksCompleted: 0,
            votesGiven: 0,
            totalPoints: 0,
            lastActive: null
        };
    }

    updateStreak(userId) {
        if (!this.data.streaks[userId]) {
            this.data.streaks[userId] = {
                current: 0,
                longest: 0,
                lastCompletion: null
            };
        }

        const now = new Date();
        const lastCompletion = this.data.streaks[userId].lastCompletion 
            ? new Date(this.data.streaks[userId].lastCompletion) 
            : null;

        if (lastCompletion) {
            const daysDiff = Math.floor((now - lastCompletion) / (1000 * 60 * 60 * 24));
            
            if (daysDiff === 1) {
                // Consecutive day
                this.data.streaks[userId].current += 1;
            } else if (daysDiff > 1) {
                // Streak broken
                this.data.streaks[userId].current = 1;
            }
            // Same day completion doesn't change streak
        } else {
            this.data.streaks[userId].current = 1;
        }

        // Update longest streak
        if (this.data.streaks[userId].current > this.data.streaks[userId].longest) {
            this.data.streaks[userId].longest = this.data.streaks[userId].current;
        }

        this.data.streaks[userId].lastCompletion = now.toISOString();
        this.save();
    }

    getStreak(userId) {
        return this.data.streaks[userId] || {
            current: 0,
            longest: 0,
            lastCompletion: null
        };
    }

    getTasksByDeadline() {
        const tasks = [];
        const now = new Date();

        for (const userId in this.data.tasks) {
            for (const task of this.data.tasks[userId]) {
                if (task.status === 'pending' && task.deadline) {
                    const deadline = new Date(task.deadline);
                    const hoursUntil = (deadline - now) / (1000 * 60 * 60);
                    
                    tasks.push({
                        ...task,
                        userId,
                        hoursUntil,
                        overdue: hoursUntil < 0
                    });
                }
            }
        }

        return tasks.sort((a, b) => a.hoursUntil - b.hoursUntil);
    }

    addTag(taskId, tag) {
        for (const userId in this.data.tasks) {
            const task = this.data.tasks[userId].find(t => t.id === taskId);
            if (task) {
                if (!task.tags) task.tags = [];
                if (!task.tags.includes(tag)) {
                    task.tags.push(tag);
                    this.save();
                    return true;
                }
            }
        }
        return false;
    }

    getTasksByTag(tag) {
        const tasks = [];
        for (const userId in this.data.tasks) {
            for (const task of this.data.tasks[userId]) {
                if (task.tags && task.tags.includes(tag) && task.status === 'pending') {
                    tasks.push({ ...task, userId });
                }
            }
        }
        return tasks;
    }

    setTargetGroup(groupId) {
        this.data.settings.targetGroup = groupId;
        this.save();
    }

    getTargetGroup() {
        return this.data.settings.targetGroup;
    }

    incrementReminder(taskId) {
        for (const userId in this.data.tasks) {
            const task = this.data.tasks[userId].find(t => t.id === taskId);
            if (task) {
                task.reminders = (task.reminders || 0) + 1;
                this.save();
                return task.reminders;
            }
        }
        return 0;
    }
}

module.exports = new Database();
