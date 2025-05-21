# websync

Web based sync for FileMaker Server to Mobile apps.

This project is a standalone web application designed to run inside a FileMaker web viewer. It is built using Vue.js and Vite, with Tailwind CSS for styling.

## Project Setup and Structure

- **Framework**: Vue.js 3
- **Build Tool**: Vite
- **Styling**: Tailwind CSS
- **Single File Output**: The project is configured to bundle all HTML, CSS, and JavaScript into a single `index.html` file for easy integration into a FileMaker web viewer.

## Key Commands

### Development

To run the development server with hot module replacement:

```bash
npm run dev
```

This will typically start the server at `http://localhost:5173/`.

### Building for Production

To build the application for production:

```bash
npm run build
```

### FileMaker Web Viewer Integration

After running the `npm run build` command, the single file to be used within the FileMaker web viewer is located at:

`dist/index.html`

### Previewing the Production Build

After building, you can preview the production output locally:

```bash
npm run preview
```

### Linting and Formatting

To lint your code using ESLint and attempt to automatically fix issues:

```bash
npm run lint
```

To format your code using Prettier:

```bash
npm run format
```

### Unit Testing

To run unit tests using Vitest:

```bash
npm run test:unit
```
