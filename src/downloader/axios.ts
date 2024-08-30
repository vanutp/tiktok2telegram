import axios, { AxiosRequestConfig } from 'axios'
import { IDownloader } from ".";
import { Artifact, StrObj } from '../types'
import { writeFile } from "fs/promises";
import { Stream } from "stream";
import { DefaultTempFileProvider, ITmpFileProvider } from "../tmp";
import { ImmediateRecycler, IRecycler } from "../recycler";
import { logger } from "../logging";

export class AxiosDownloader implements IDownloader {
  private tmp: ITmpFileProvider = DefaultTempFileProvider
  private recycler: IRecycler = ImmediateRecycler
  constructor(private headers: StrObj | null = null) {}

  async download(url: string): Promise<Artifact> {
    const config: AxiosRequestConfig = {
      responseType: "stream",
      onDownloadProgress(progressEvent) {
        logger.debug(
          `Downloading ${url}: ${(progressEvent.progress ?? Number.NaN) * 100}%`
        );
      },
    }
    if (this.headers) {
      config.headers = this.headers;
    }
    const { data: stream, headers } = await axios.get<Stream>(url, config);
    const dest = await this.tmp.createUniquePath();
    try {
      await writeFile(dest, stream);
    } catch (e) {
      this.recycler.recycle(dest);
      throw e;
    }
    return {
      path: dest,
      contentType: headers["content-type"],
    };
  }
}
