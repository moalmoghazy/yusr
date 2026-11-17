-- «قصص نجاح» stories can lead with a video of the person who was helped (with their consent): the address
-- of a 1080p MP4 the hub sets on the story (an https link, or a file the website serves under /story-videos/).
-- NULL keeps the photo or the illustrated scene, as before.
ALTER TABLE case_stories ADD COLUMN video_url text;
