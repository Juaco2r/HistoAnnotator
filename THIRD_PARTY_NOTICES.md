# Third-party components

The Docker build downloads OpenSeadragon 6.0.2 from jsDelivr and stores it inside the application image, so the tablet does not depend on the CDN at runtime.
OpenSeadragon is released under the BSD 3-Clause license:
https://github.com/openseadragon/openseadragon

The backend uses FastAPI, Uvicorn, OpenSlide Python and Pillow under their
respective open-source licenses. Review their license files before
redistributing a production build.
