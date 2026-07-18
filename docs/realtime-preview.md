# Realtime preview

The cup fragment shader reflects the camera-to-fragment ray about the cup normal, intersects the nominal spherical cap analytically, converts the hit to manufacturing `printUV`, and samples the same print layer used by the plate. Miss rays sample the neutral studio environment. Off-design views must naturally distort or lose the hidden image.

Orbit controls target the optical cup centre, disable pan, allow full azimuth, clamp polar angle to 15–75°, distance to 0.22–0.90 m and expose a best-view reset.

Rendering is on demand. Mobile DPR is capped at 1.5 and desktop at 2; interaction may temporarily reduce DPR. Preview textures are 512/1024. 4096 production images are never uploaded to the GPU.

Budget: first interactive 3D under 3 seconds on the test profile; desktop interaction P95 below 50 ms, middle-tier mobile below 100 ms; no continuous frames when static.
