import UIKit
import Vision
import ImageIO

enum PoseEstimatorError: LocalizedError {
    case missingCGImage
    case noPersonDetected
    case notEnoughLandmarks

    var errorDescription: String? {
        switch self {
        case .missingCGImage:
            return "Could not read the selected image."
        case .noPersonDetected:
            return "No full body was detected. Try a clear front-facing photo."
        case .notEnoughLandmarks:
            return "Not enough body landmarks were visible. Use a full-body image with arms and legs visible."
        }
    }
}

struct BodyPose {
    let imageSize: CGSize
    let joints: [VNHumanBodyPoseObservation.JointName: CGPoint]

    subscript(_ joint: VNHumanBodyPoseObservation.JointName) -> CGPoint? {
        joints[joint]
    }
}

final class PoseEstimator {
    private static let requiredJoints: [VNHumanBodyPoseObservation.JointName] = [
        .leftShoulder,
        .rightShoulder,
        .leftHip,
        .rightHip,
        .leftKnee,
        .rightKnee,
        .leftAnkle,
        .rightAnkle,
        .neck,
        .root
    ]

    func detectPose(in image: UIImage) async throws -> BodyPose {
        guard let cgImage = image.cgImage else {
            throw PoseEstimatorError.missingCGImage
        }

        let request = VNDetectHumanBodyPoseRequest()
        let orientation = CGImagePropertyOrientation(image.imageOrientation)
        let handler = VNImageRequestHandler(cgImage: cgImage, orientation: orientation)
        try handler.perform([request])

        guard let observation = request.results?.first else {
            throw PoseEstimatorError.noPersonDetected
        }

        var joints: [VNHumanBodyPoseObservation.JointName: CGPoint] = [:]

        for joint in Self.requiredJoints {
            let point = try observation.recognizedPoint(joint)
            guard point.confidence > 0.25 else { continue }

            joints[joint] = CGPoint(
                x: CGFloat(point.x) * image.size.width,
                y: (1 - CGFloat(point.y)) * image.size.height
            )
        }

        guard joints[.leftShoulder] != nil,
              joints[.rightShoulder] != nil,
              joints[.leftHip] != nil,
              joints[.rightHip] != nil else {
            throw PoseEstimatorError.notEnoughLandmarks
        }

        return BodyPose(imageSize: image.size, joints: joints)
    }
}

private extension CGImagePropertyOrientation {
    init(_ orientation: UIImage.Orientation) {
        switch orientation {
        case .up:
            self = .up
        case .upMirrored:
            self = .upMirrored
        case .down:
            self = .down
        case .downMirrored:
            self = .downMirrored
        case .left:
            self = .left
        case .leftMirrored:
            self = .leftMirrored
        case .right:
            self = .right
        case .rightMirrored:
            self = .rightMirrored
        @unknown default:
            self = .up
        }
    }
}
