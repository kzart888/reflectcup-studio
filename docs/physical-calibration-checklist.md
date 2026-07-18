# Physical calibration checklist

This procedure starts only after the nominal digital MVP has passed and a representative cup, dish and printer are available. Do not call the nominal profile production-accurate before completing it.

## 1. Prepare the print

1. Export the numbered checker through the selected optical profile at final production resolution.
2. Print at 100% scale with no driver fit, border expansion or automatic rotation.
3. Use the production ink, coating and dish stock. Record printer, RIP preset, ink set, material lot and measured dish diameter.
4. Confirm the four corner colors and `UP`/`RIGHT` markers against `manifest.json`. Reject any mirrored or rotated output.

## 2. Locate cup and dish

1. Mark the dish center, cup axis and profile cup offset on a removable transparent setup sheet.
2. Seat the cup concentrically on the specified axis mark. Photograph the top view before moving it.
3. Measure cup outer diameter and height, dish diameter and dish depth to 0.1 mm where possible.
4. Record any wobble, tilt or eccentricity. Do not compensate silently in software.

## 3. Set the camera

1. Mount the camera on a tripod. Disable portrait mode, HDR stacking, digital zoom and perspective correction.
2. Put the entrance pupil at the profile design eye position: nominally 600 mm from the cup and 480 mm above the dish plane, aimed at the cup optical target.
3. Use a normal-equivalent focal length near 50 mm, fixed white balance, fixed exposure and the lowest practical ISO.
4. Fill the frame consistently while retaining the entire cup, dish and setup markers.

## 4. Capture the required series

Keep focus, exposure, cup and dish fixed. Only move the camera around the cup-axis target.

| View | Horizontal offset | Required filename suffix |
| --- | ---: | --- |
| Design | 0° | `view-00` |
| Left | −5° | `view-m05` |
| Left | −10° | `view-m10` |
| Right | +5° | `view-p05` |
| Right | +10° | `view-p10` |

Capture each of these inputs with the same five views:

- numbered checker;
- direction/text target;
- frequency sweep;
- synthetic portrait.

Use filenames such as `nominal-v1_checker_view-p05_raw.jpg`. Keep the untouched originals and a CSV containing timestamp, camera, lens, focal length, aperture, shutter, ISO, white balance, measured eye position and setup measurements.

## 5. Evaluate and iterate

1. At `view-00`, compare reflected ROI landmarks with the source target and record displacement as a percentage of the reflected ROI.
2. Verify that all numbered cells keep their expected neighbors and that no folded triangle is treated as valid.
3. Confirm text and direction are neither mirrored nor rotated.
4. Verify the ±5° and ±10° images naturally degrade or move; they must not remain camera-locked.
5. Adjust only a new draft profile. Never mutate the already published profile or its LUT.
6. Publish a production profile only after repeated prints meet the agreed physical error target of 3–5% of reflected ROI or better.

Store raw photos, measurements, production CSVs and unpublished profile bundles under `private/`; never commit them to the public repository.
