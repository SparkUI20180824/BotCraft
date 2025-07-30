const mineflayer = require('mineflayer');
const path = require('path');
const fs = require('fs');
const { loadSettings, loadPlayerConfig, sleep } = require('./ai_bot/utils');
const { setupAIBehavior } = require('./ai_bot/behaviors');
const { AIClient } = require('./ai_bot/api');

class BotCraft {
  constructor() {
    try {
      // 加载配置
      this.settings = loadSettings();
      this.playerConfig = loadPlayerConfig();
      
      // 初始化状态
      this.bot = null;
      this.aiClient = new AIClient();
      this.isConnected = false;
      this.actionsQueue = [];
      this.currentAction = null;
      this.reconnectAttempts = 0;

      // 设置默认值
      this.settings.version = this.settings.version || '1.19.2';
      this.settings['server-ip'] = this.settings['server-ip'] || 'localhost';
      this.settings.port = this.settings.port || 25565;
      this.playerConfig.username = this.playerConfig.username || 'AIBot';
      
      console.log('[系统] BotCraft实例已创建');
    } catch (error) {
      console.error('[错误] 初始化失败:', error);
      process.exit(1);
    }
  }

  async initialize() {
    try {
      console.log('[系统] 正在初始化BotCraft...');
      
      // 创建机器人实例（简化配置）
      this.bot = mineflayer.createBot({
        host: this.settings['server-ip'],
        port: this.settings.port,
        username: this.playerConfig.username,
        version: this.settings.version,
        auth: 'offline'
      });

      // 设置事件监听
      this.setupEventListeners();
      
      // 设置AI行为
      setupAIBehavior(this);

      console.log('[系统] 初始化成功');
      this.setupEventListeners();
    } catch (error) {
      console.error('[错误] 初始化失败:', error);
      this.reconnect();
    }
  }

  setupEventListeners() {
    this.bot.on('login', () => {
      this.isConnected = true;
      this.reconnectAttempts = 0;
      console.log(`[连接] 已登录为 ${this.bot.username}`);
    });

    this.bot.on('spawn', () => {
      console.log('[世界] 已生成');
      this.bot.chat('/bw join Solo');
      this.bot.chat('已加入/重生');
      
      // 每5秒检测周围实体
      setInterval(() => {
        this.checkEntities();
      }, 5000);
    });

    this.bot.on('death', () => {
      console.log('[状态] 死亡');
      this.queueAction({ type: 'respawn', priority: 1000 });
    });

    this.bot.on('health', () => {
      if (this.bot.health < 10) {
        this.queueAction({ type: 'emergency', action: 'heal', priority: 100 });
      }
    });

    this.bot.on('end', () => {
      console.log('[连接] 断开连接');
      this.isConnected = false;
      this.reconnect();
    });

    this.bot.on('error', (err) => {
      console.error('[错误] 机器人错误:', err);
      this.reconnect();
    });
  }

  checkEntities() {
    if (!this.bot.entities) return;
    
    Object.values(this.bot.entities).forEach(entity => {
      if (entity.type === 'mob' && 
          entity.position.distanceTo(this.bot.entity.position) < 6) {
        this.queueAction({
          type: 'combat',
          target: entity,
          priority: 90
        });
      }
    });
  }

  reconnect() {
    if (this.isConnected || this.reconnectAttempts >= 5) return;
    
    const delay = Math.floor(5000);
    console.log(`[连接] 将在 ${delay/1000}秒后重连`);
    
    setTimeout(() => this.initialize(), delay);
  }

  queueAction(action) {
    if (!action.priority) action.priority = 10;
    this.actionsQueue.push(action);
    this.actionsQueue.sort((a, b) => b.priority - a.priority);
    this.processQueue();
  }

  async processQueue() {
    if (this.currentAction || this.actionsQueue.length === 0) return;
    
    this.currentAction = this.actionsQueue.shift();
    try {
      console.log(`[动作] 执行: ${JSON.stringify(this.currentAction)}`);
      const actions = new (require('./ai_bot/actions'))(this);
      await actions.execute(this.currentAction);
    } catch (error) {
      console.error('[错误] 动作执行失败:', error);
    } finally {
      this.currentAction = null;
      process.nextTick(() => this.processQueue());
    }
  }
}

// 启动
const bot = new BotCraft();
bot.initialize();

module.exports = BotCraft;