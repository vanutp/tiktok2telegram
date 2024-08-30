import { HashTag } from '../hash/parser'
import { Artifact, Video } from '../types'

export type VideoUpload = {
  artifacts: Artifact[];
  video: Video;
  tags: Set<HashTag>;
};

export interface ITelegramApi {
  sendMessage(message: string): void;
  sendVideo(upload: VideoUpload): Promise<void>;
}
