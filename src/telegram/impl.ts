import { ITelegramApi, VideoUpload } from "."
import TelegramBot, { InputMedia } from 'node-telegram-bot-api'
import { Semaphore } from "semaphore-promise";
import { logger } from "../logging";
import { HashTag } from "../hash/parser";
import mime from 'mime'

export type Chats = {
  author: string;
  targetChannel: string;
};

export class TelegramApi implements ITelegramApi {
  private chats: Readonly<Chats>;

  constructor(
    private bot: TelegramBot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN),
    chats: Chats = {
      author: process.env.TELEGRAM_OWNER_ID,
      targetChannel: process.env.TELEGRAM_CHANNEL_ID,
    },
    private semaphore: Semaphore = new Semaphore(1)
  ) {
    this.chats = Object.freeze({ ...chats });
  }

  sendMessage(message: string): void {
    this.bot.sendMessage(this.chats.author, message).catch((e) => {
      logger.error(
        `Couldn't send message to author (${this.chats.targetChannel})`,
        e
      );
    });
  }

  async sendVideo({
    artifacts: _artifacts,
    video,
    tags,
  }: VideoUpload): Promise<void> {
    const release = await this.semaphore.acquire();
    const artifacts = _artifacts.map((artifact, i) => {
      let res: InputMedia
      const ext = mime.getExtension(artifact.contentType)
      const filename = _artifacts.length > 1 ? `${video.id}_${i}.${ext}` : `${video.id}.${ext}`
      const commonOptions = {
        media: artifact.path,
        fileOptions: {
          filename,
          contentType: artifact.contentType,
        },
      }
      if (artifact.contentType.startsWith('video/')) {
        res = {
          type: 'video',
          ...commonOptions,
        }
      } else if (artifact.contentType.startsWith('image/')) {
        res = {
          type: 'photo',
          ...commonOptions,
        }
      } else {
        console.error(`Unknown contentType ${artifact.contentType}`)
        return null
      }
      if (i == 0) {
        res.caption = processCaption(video.url, tags)
        res.parse_mode = "MarkdownV2"
      } else {
        // images sent alongside merged video in photo tiktoks
        res.has_spoiler = true
      }
      return res
    }).filter(artifact => artifact != null)
    try {
      while (artifacts.length > 0) {
        const toSend = artifacts.splice(0, 10)
        await this.bot.sendMediaGroup(
          this.chats.targetChannel,
          toSend,
        );
        if (artifacts.length > 0) {
          await new Promise(resolve => setTimeout(resolve, 10_000))
        }
      }
    } finally {
      release();
    }
  }
}

function processCaption(url: string, tags: Set<HashTag>): string {
  return `[TikTok](${url}) ${processTags(Array.from(tags))}`.trim();
}

export function processTags(tags: HashTag[]): string {
  return tags
    .map((tag) => tag.replace(/(_)/g, "\\$1"))
    .map((tag) => `\\${tag}`)
    .join(" ");
}
