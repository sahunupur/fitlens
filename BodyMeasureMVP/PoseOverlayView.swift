import SwiftUI
import Vision

struct PoseOverlayView: View {
    let image: UIImage
    let pose: BodyPose?

    private let bones: [(VNHumanBodyPoseObservation.JointName, VNHumanBodyPoseObservation.JointName)] = [
        (.leftShoulder, .rightShoulder),
        (.leftShoulder, .leftHip),
        (.rightShoulder, .rightHip),
        (.leftHip, .rightHip),
        (.leftHip, .leftKnee),
        (.leftKnee, .leftAnkle),
        (.rightHip, .rightKnee),
        (.rightKnee, .rightAnkle),
        (.neck, .leftShoulder),
        (.neck, .rightShoulder)
    ]

    var body: some View {
        GeometryReader { proxy in
            let rect = aspectFitRect(imageSize: image.size, containerSize: proxy.size)

            ZStack {
                Image(uiImage: image)
                    .resizable()
                    .scaledToFit()
                    .frame(width: proxy.size.width, height: proxy.size.height)

                if let pose {
                    Path { path in
                        for bone in bones {
                            guard let start = pose[bone.0], let end = pose[bone.1] else { continue }
                            path.move(to: map(start, from: pose.imageSize, into: rect))
                            path.addLine(to: map(end, from: pose.imageSize, into: rect))
                        }
                    }
                    .stroke(.teal, lineWidth: 4)

                    ForEach(Array(pose.joints.keys), id: \.self) { joint in
                        if let point = pose[joint] {
                            Circle()
                                .fill(.orange)
                                .frame(width: 12, height: 12)
                                .position(map(point, from: pose.imageSize, into: rect))
                        }
                    }
                }
            }
        }
    }

    private func aspectFitRect(imageSize: CGSize, containerSize: CGSize) -> CGRect {
        let imageAspect = imageSize.width / imageSize.height
        let containerAspect = containerSize.width / containerSize.height

        if imageAspect > containerAspect {
            let width = containerSize.width
            let height = width / imageAspect
            return CGRect(x: 0, y: (containerSize.height - height) / 2, width: width, height: height)
        } else {
            let height = containerSize.height
            let width = height * imageAspect
            return CGRect(x: (containerSize.width - width) / 2, y: 0, width: width, height: height)
        }
    }

    private func map(_ point: CGPoint, from imageSize: CGSize, into rect: CGRect) -> CGPoint {
        CGPoint(
            x: rect.minX + (point.x / imageSize.width) * rect.width,
            y: rect.minY + (point.y / imageSize.height) * rect.height
        )
    }
}
