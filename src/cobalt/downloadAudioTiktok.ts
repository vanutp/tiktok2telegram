// https://github.com/imputnet/cobalt/blob/afa33c404355e1a00d884a2db837233bca54f7f6/src/modules/processing/services/tiktok.js
import { Artifact } from '../types'
import { Cookie } from './cookie'
import { updateCookie } from './cookieManager'
import { AxiosDownloader } from '../downloader/axios'
import * as child_process from 'node:child_process'
import { DefaultTempFileProvider } from '../tmp'
import { ImmediateRecycler } from '../recycler'
import ffmpegPath from 'ffmpeg-static'
import axios from 'axios'
import { SocksProxyAgent } from 'socks-proxy-agent'

if (!ffmpegPath) {
  throw new Error('ffmpeg from ffmpeg-static is null')
}

const genericUserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

export async function downloadAudioTiktok(id: string): Promise<Artifact[]> {
  const cookie = new Cookie({})

  // should always be /video/, even for photos
  const agent = process.env.PROXY ? new SocksProxyAgent(process.env.PROXY) : undefined
  const res = await axios.get(`https://tiktok.com/@i/video/${id}`, {
    headers: {
      'user-agent': genericUserAgent,
      cookie: cookie.toString(),
    },
    httpAgent: agent,
    httpsAgent: agent,
  })
  updateCookie(cookie, res.headers)
  const downloader = new AxiosDownloader({ cookie: cookie.toString() })

  const html = res.data

  const json = html
    .split('<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__" type="application/json">')[1]
    .split('</script>')[0]
  const data = JSON.parse(json)
  const detail = data['__DEFAULT_SCOPE__']['webapp.video-detail']['itemInfo']['itemStruct']

  let video, audio

  const imagesData = detail.imagePost?.images

  const playAddr = detail.video.playAddr

  if (!imagesData) {
    video = playAddr
  } else {
    audio = playAddr

    if (!audio) {
      audio = detail.music.playUrl
    }
  }

  if (video) {
    return [await downloader.download(video)]
  }

  const audioArtifact = await downloader.download(audio)

  if (imagesData) {
    const imageLinks: string[] = imagesData
      .map((i: any) => i.imageURL.urlList.find((p: string) => p.includes('.jpeg?')))

    const imageArtifacts = await Promise.all(imageLinks.map(url => downloader.download(url)))
    const imagePaths = imageArtifacts.map(x => x.path)
    const audioPath = audioArtifact.path
    const outPath = await DefaultTempFileProvider.createUniquePath() + '.mp4'

    const FRAME_DURATION = 3
    const TRANSITION_DURATION = 0.2
    const ffmpegCmd: string[] = []
    for (const path of imagePaths) {
      ffmpegCmd.push(
        '-loop', '1',
        '-t', FRAME_DURATION.toString(),
        '-i', path,
      )
    }
    let filterInputs = ''
    let filterAnimations = ''
    for (let i = 0; i < imagePaths.length; ++i) {
      filterInputs += `[${i}:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1[cr${i}];`
      if (i != 0) {
        const from = i == 1 ? '[cr0]' : `[fade${i - 1}]`
        const to = `[cr${i}]`
        const target = i == imagePaths.length - 1 ? `[v]` : `[fade${i}];`
        filterAnimations += `${from}${to}xfade=transition=slideleft:duration=${TRANSITION_DURATION}:offset=${(FRAME_DURATION - TRANSITION_DURATION) * i}${target}`
      }
    }
    if (imagePaths.length == 1) {
      filterAnimations = '[cr0]null[v]'
    }
    ffmpegCmd.push(
      '-i', audioPath,
      '-filter_complex',
      `${filterInputs}${filterAnimations}`,
      '-map', '[v]',
      '-map', `${imagePaths.length}:a`,
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'copy',
      outPath,
    )

    console.debug(ffmpegCmd.join(' '))

    try {
      await new Promise<void>((resolve, reject) => {
        const proc = child_process.spawn(ffmpegPath!, ffmpegCmd, {
          stdio: 'inherit',
        })
        proc.on('exit', code => {
          if (code == 0) {
            resolve()
          } else {
            reject('Failed to convert')
          }
        })
      })
    } catch (e) {
      ImmediateRecycler.recycle(outPath)
      throw e
    } finally {
      ImmediateRecycler.recycle(audioPath)
    }

    return [
      {
        path: outPath,
        contentType: 'video/mp4',
      },
      ...imageArtifacts,
    ]
  }

  if (audio) {
    return [audioArtifact]
  }

  throw new Error('Everything is null!!')
}
