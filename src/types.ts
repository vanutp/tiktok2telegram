export type Url = string;
export type FilePath = string;
export type ContentType = string;

export type VideoId = string;
export type Video = {
  __og: unknown;
  id: VideoId;
  sourceUrl: Url;
  url: Url;
  description: string;
};
export type VideoMap = Map<VideoId, Video>;

export type Artifact = {
  path: FilePath;
  contentType: ContentType;
};

export type StrObj = { [key: string]: string };
