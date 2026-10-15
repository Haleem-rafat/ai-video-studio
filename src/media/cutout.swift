// Lifts the subject out of a photo with macOS Vision (the same cut-out as
// Photos), writing a transparent PNG cropped to the subject.
// Usage: cutout <input> <output.png>
import Foundation
import Vision
import CoreImage
import ImageIO
import UniformTypeIdentifiers

let args = CommandLine.arguments
let input = URL(fileURLWithPath: args[1]), output = URL(fileURLWithPath: args[2])
guard let image = CIImage(contentsOf: input, options: [.applyOrientationProperty: true]) else { fatalError("cannot read") }
let request = VNGenerateForegroundInstanceMaskRequest()
let handler = VNImageRequestHandler(ciImage: image)
try handler.perform([request])
guard let result = request.results?.first else { fatalError("no subject found") }
let buffer = try result.generateMaskedImage(ofInstances: result.allInstances, from: handler, croppedToInstancesExtent: true)
let masked = CIImage(cvPixelBuffer: buffer)
let context = CIContext()
guard let cg = context.createCGImage(masked, from: masked.extent) else { fatalError("render failed") }
let dest = CGImageDestinationCreateWithURL(output as CFURL, UTType.png.identifier as CFString, 1, nil)!
CGImageDestinationAddImage(dest, cg, nil)
CGImageDestinationFinalize(dest)
print("ok", cg.width, cg.height)
