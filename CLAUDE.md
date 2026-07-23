# CLAUDE.md

## Project Overview

Personal website for Moe, hosted on GitHub Pages at kingsmil.github.io.

## Tech Stack

- **Framework**: React (create-react-app)
- **Hosting**: GitHub Pages
- **Domain**: www.moethu.com (via GitHub Pages + CNAME)

## Directory Structure

This repo contains the **built/deployed** output, not the source code:
- `index.html` — Entry point (minified React app)
- `static/js/` — Bundled JavaScript
- `static/css/` — Bundled CSS
- `static/media/` — Images and other assets
- `githubres.pdf` — Resume/CV PDF

## Important Notes

- This is a **production build** repo — the React source code is compiled and minified
- To make meaningful changes, the source React project needs to be built and the output copied here
- Direct edits to `static/js/*.js` or `static/css/*.css` are not practical (minified bundles)
- The `CNAME` file controls the custom domain — do not remove it

## Workflow

- Build changes in the source React project first
- Copy the build output to this repo
- Commit and push to deploy via GitHub Pages
