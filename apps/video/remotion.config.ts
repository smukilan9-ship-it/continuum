import { Config } from "@remotion/cli/config";

Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);

// Cinematic master settings for the launch film. ProRes keeps the Remotion
// segments losslessly editable when they land on the DaVinci Resolve timeline.
Config.setCodec("prores");
Config.setProResProfile("hq");
Config.setPixelFormat("yuv422p10le");
Config.setConcurrency(null);
