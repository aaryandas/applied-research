"""Fixed entry point. Request data is never interpolated into source or CLI flags."""
import shutil
import sys
from pathlib import Path
from validation import decode


def main():
    recipe = decode(Path('/job/request.json').read_text(encoding='utf-8'))
    import manim
    if manim.__version__ != '0.21.0':
        raise RuntimeError('runtime mismatch')
    from scenes import RecipeScene
    with manim.tempconfig({
        'renderer': 'cairo', 'pixel_width': 1280, 'pixel_height': 720,
        'frame_rate': 30, 'frame_width': 14.2222222222, 'frame_height': 8,
        'background_color': '#0c0f12', 'media_dir': '/job/media',
        'output_file': 'artifact', 'format': 'mp4', 'write_to_movie': True,
        'disable_caching': True, 'progress_bar': 'none', 'verbosity': 'ERROR',
    }):
        scene = RecipeScene(recipe)
        scene.render()
        shutil.copyfile(scene.renderer.file_writer.movie_file_path, '/job/artifact.mp4')
    # Internal working files never become published artifacts.
    shutil.rmtree('/job/media')
    print('AR_RENDER_COMPLETE', flush=True)


if __name__ == '__main__':
    try:
        main()
    except Exception:
        # No traceback can disclose label content or paths through Manim/Pango errors.
        print('AR_RENDER_FAILED', file=sys.stderr, flush=True)
        sys.exit(1)
