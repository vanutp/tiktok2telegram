import { IDownloader } from "./downloader";
import { AxiosDownloader } from "./downloader/axios";
import { HashTag } from "./hash/parser";
import { HashProcessor } from "./hash/processor";
import { logger } from "./logging";
import { ImmediateRecycler, IRecycler } from "./recycler";
import { Scheduler } from "./scheduler";
import { SetTimeoutScheduler } from "./scheduler/setTimeout";
import { Storage } from "./storage";
import { ITelegramApi } from "./telegram";
import { TelegramApi } from "./telegram/impl";
import { ITikTokApi } from "./tiktok/api";
import { ZetreexTikTokApi } from "./tiktok/zetreex";
import { Artifact, Video, VideoMap } from "./types";
import { downloadAudioTiktok } from './cobalt/downloadAudioTiktok'

export class Server {
  private lastBadRequests = 0;

  constructor(
    private storage: Storage,
    private tiktok: ITikTokApi = new ZetreexTikTokApi(),
    private telegram: ITelegramApi = new TelegramApi(),
    private hash: HashProcessor = new HashProcessor(),
    private downloader: IDownloader = new AxiosDownloader(),
    private scheduler: Scheduler = new SetTimeoutScheduler(),
    private recycler: IRecycler = ImmediateRecycler,
    private dry: boolean = process.env.TIKTOK_SERVER_DRY_RUN === "true"
  ) {}

  start(): void {
    this.tick();
  }

  stop(): void {
    this.scheduler.cleanUp();
  }

  private tick() {
    this.doTick()
      .catch((e) => {
        logger.error("Tick error", e);
        this.telegram.sendMessage("Ошибка");
      })
      .finally(() => this.scheduler.sleep().then(() => this.tick()));
  }

  private async doTick(): Promise<void> {
    logger.info("Querying liked videos...");
    let videoMap: VideoMap;
    try {
      videoMap = await this.tiktok.getLatestLikedVideos();
    } catch (e) {
      logger.error("TikTok service error", e);
      this.lastBadRequests++;
      if (this.lastBadRequests == 2) {
        this.telegram.sendMessage("Сервис TikTok недоступен");
      }
      return;
    }
    if (this.lastBadRequests > 2) {
      logger.info("TikTok is now available");
      this.telegram.sendMessage("Сервис TikTok восстановлен");
    }
    this.lastBadRequests = 0;
    const newVideoIds = await this.storage.getNonPostedVideoIds(
      videoMap.keys()
    );
    const newVideos = newVideoIds
      .map((id) => videoMap.get(id))
      .filter((video) => !!video) as Video[];
    if (newVideos.length == 0) {
      logger.info(`No new videos found`);
      return;
    }
    logger.info(
      `Found new videos:\n${JSON.stringify(newVideos, undefined, 2)}`
    );
    const videosAwait: Promise<void>[] = newVideos.map((video) =>
      this.processVideo(video)
    );
    await Promise.all(videosAwait);
    logger.info(`Uploads finished`);
    if (this.dry) {
      logger.warn("Dry-run enabled. Video were not actually uploaded");
    }
  }

  private async processVideo(video: Video): Promise<void> {
    let artifacts: Artifact[];
    try {
      artifacts = await this.downloadVideo(video);
    } catch (e) {
      // TODO remember bad videos?
      logger.error(`Couldn't download ${video.id}`, e);
      this.telegram.sendMessage(`Не удалось скачать ${video.url}`);
      return;
    }
    if (this.dry) {
      return;
    }
    try {
      await this.uploadVideo(video, artifacts);
    } catch (e) {
      logger.error(`Couldn't upload ${video.id}`, e);
      this.telegram.sendMessage(`Не удалось загрузить ${video.url}`);
      return;
    } finally {
      for (const artifact of artifacts) {
        this.recycle(artifact);
      }
    }
    try {
      await this.storage.addToPostedVideoIds(video.id);
    } catch (e) {
      logger.error(`Couldn't save to posted videos ${video.id}`, e);
      this.telegram.sendMessage(
        `Не удалось сохранить в опубликованные видео ${video.url}`
      );
      return;
    }
  }

  private async downloadVideo({ id, sourceUrl }: Video): Promise<Artifact[]> {
    let artifacts: Artifact[];
    if (sourceUrl.endsWith(".mp3") || sourceUrl.includes("-music-")) {
      logger.info(`Downloading ${id} (photos)`);
      artifacts = await downloadAudioTiktok(id);
    } else {
      logger.info(`Downloading ${id} (video)`);
      artifacts = [await this.downloader.download(sourceUrl)];
    }
    logger.info(`Download finished ${id}`);
    return artifacts;
  }

  private async extractHashTags({
    id,
    url,
    description,
  }: Video): Promise<Set<HashTag>> {
    try {
      return await this.hash.process(description);
    } catch (e) {
      logger.error(`Couldn't extract hash tags from ${id}`, e);
      this.telegram.sendMessage(`Ошибка поиска хэштегов ${url}`);
      return new Set();
    }
  }

  private async uploadVideo(
    video: Video,
    artifacts: Artifact[]
  ): Promise<void> {
    logger.info(`Uploading ${video.id}`);
    return await this.telegram.sendVideo({
      artifacts,
      video,
      tags: await this.extractHashTags(video),
    });
  }

  private recycle(artifact: Artifact) {
    this.recycler.recycle(artifact.path);
    logger.debug(`Artifact removed: ${artifact.path}`);
  }
}
