import CoreGraphics
import Vision

struct MeasurementResult {
    let bust: Double
    let waist: Double
    let hips: Double
    let shoulders: Double
    let inseam: Double
    let underbust: Double
    let confidence: String
}

final class MeasurementEstimator {
    func estimate(from pose: BodyPose, heightInches: Double) -> MeasurementResult {
        let shoulderMidpoint = midpoint(pose[.leftShoulder], pose[.rightShoulder])
        let hipMidpoint = midpoint(pose[.leftHip], pose[.rightHip])

        let topY = min(
            pose[.neck]?.y ?? shoulderMidpoint.y,
            shoulderMidpoint.y
        )
        let bottomY = max(
            pose[.leftAnkle]?.y ?? hipMidpoint.y,
            pose[.rightAnkle]?.y ?? hipMidpoint.y,
            hipMidpoint.y
        )

        let bodyPixelHeight = max(1, bottomY - topY)
        let scale = heightInches / Double(bodyPixelHeight)

        let shoulderWidth = distance(pose[.leftShoulder], pose[.rightShoulder]) * scale
        let hipWidth = distance(pose[.leftHip], pose[.rightHip]) * scale

        let leftInseam = distance(pose[.leftHip], pose[.leftAnkle]) * scale
        let rightInseam = distance(pose[.rightHip], pose[.rightAnkle]) * scale
        let inseam = averageAvailable(leftInseam, rightInseam) * 0.92

        let bust = shoulderWidth * 2.15
        let waist = hipWidth * 1.65
        let hips = hipWidth * 2.08
        let underbust = bust * 0.86

        let confidence = pose.joints.count >= 8 ? "Medium demo estimate" : "Low demo estimate"

        return MeasurementResult(
            bust: bust,
            waist: waist,
            hips: hips,
            shoulders: shoulderWidth,
            inseam: inseam,
            underbust: underbust,
            confidence: confidence
        )
    }

    private func distance(_ a: CGPoint?, _ b: CGPoint?) -> Double {
        guard let a, let b else { return 0 }
        let dx = Double(a.x - b.x)
        let dy = Double(a.y - b.y)
        return (dx * dx + dy * dy).squareRoot()
    }

    private func midpoint(_ a: CGPoint?, _ b: CGPoint?) -> CGPoint {
        guard let a, let b else { return .zero }
        return CGPoint(x: (a.x + b.x) / 2, y: (a.y + b.y) / 2)
    }

    private func averageAvailable(_ values: Double...) -> Double {
        let available = values.filter { $0 > 0 }
        guard !available.isEmpty else { return 0 }
        return available.reduce(0, +) / Double(available.count)
    }
}
