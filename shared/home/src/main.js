import { mountDemoChrome } from '../../chrome';
import './home.css';

mountDemoChrome({
  title: 'Open-source demos',
  story: 'demos-home',
  sourceUrl: 'https://github.com/GrowtherSI/demos',
  // This page IS the listing, so the header leaves out its "All demos" button.
  listing: true,
});
