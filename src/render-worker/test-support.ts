import type { ProcessResult } from './process.js';
export const VIDEO_METADATA = {
  streams: [
    {
      codec_type: 'video',
      codec_name: 'h264',
      pix_fmt: 'yuv420p',
      width: 1280,
      height: 720,
      avg_frame_rate: '30/1',
      nb_frames: '300',
    },
  ],
  format: { format_name: 'mov,mp4,m4a,3gp,3g2,mj2', duration: '10.000' },
};
export const OK_PROCESS: ProcessResult = {
  status: 'exited',
  code: 0,
  stdout: '',
  stderr: '',
};
