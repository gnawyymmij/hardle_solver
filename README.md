# Hardle Solver

Interactive Hardle helper and information-gain solver for [hardle.org](https://hardle.org/).

Live page: <https://gnawyymmij.github.io/hardle_solver/>

Hardle uses Wordle-style guesses, but each guess only returns two numbers:

- green letters: correct position
- yellow letters: present in the answer but in a different position

The web app tracks Hardle feedback, filters possible answers, and ranks next guesses by expected information under a broad uniform prior. It also includes a preset-answer mode for testing and manual tile marking for recording player deductions.

## Run locally

Serve the directory with any static file server:

```sh
python -m http.server 8000
```

Then open `http://localhost:8000`.

## Data

This repository includes only the legal guess list and a precomputed blank-state ranking cache. It intentionally does not include the official daily answer schedule.
