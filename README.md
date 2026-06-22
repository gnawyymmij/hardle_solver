# Hardle Solver

An interactive helper for [hardle.org](https://hardle.org/).

Hardle uses Wordle-style guesses, but each guess only returns two numbers:

- green letters: correct position
- yellow letters: present in the answer but in a different position

This page tracks the feedback and ranks next guesses by expected information.

## Run locally

Serve the directory with any static file server:

```sh
python -m http.server 8000
```

Then open `http://localhost:8000`.

## Data

This repository includes only the legal guess list and a precomputed blank-state ranking cache. It intentionally does not include the official daily answer schedule.
