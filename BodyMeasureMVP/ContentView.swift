import PhotosUI
import SwiftUI

struct ContentView: View {
    @State private var selectedPhoto: PhotosPickerItem?
    @State private var selectedImage: UIImage?
    @State private var pose: BodyPose?
    @State private var result: MeasurementResult?
    @State private var heightText = "66"
    @State private var isAnalyzing = false
    @State private var errorMessage: String?
    @State private var showingCamera = false

    private let poseEstimator = PoseEstimator()
    private let measurementEstimator = MeasurementEstimator()

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    header
                    heightInput
                    imagePanel
                    actionButtons

                    if let result {
                        ResultCard(result: result)
                    }

                    if let errorMessage {
                        Text(errorMessage)
                            .font(.footnote)
                            .foregroundStyle(.red)
                    }

                    disclaimer
                }
                .padding()
            }
            .navigationTitle("Body Measure")
            .sheet(isPresented: $showingCamera) {
                CameraPicker(image: Binding(
                    get: { selectedImage },
                    set: { newImage in
                        selectedImage = newImage
                        resetAnalysis()
                    }
                ))
                    .ignoresSafeArea()
            }
            .onChange(of: selectedPhoto) { newItem in
                Task { await loadPhoto(newItem) }
            }
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Visual size estimate")
                .font(.largeTitle.bold())

            Text("Use a full-body front photo in fitted clothing. Enter height first so the app can convert landmark distances into rough inches.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
    }

    private var heightInput: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Height")
                .font(.headline)

            HStack {
                TextField("Height in inches", text: $heightText)
                    .keyboardType(.decimalPad)
                    .textFieldStyle(.roundedBorder)

                Text("in")
                    .foregroundStyle(.secondary)
            }
        }
    }

    private var imagePanel: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 8)
                .fill(Color(.secondarySystemBackground))

            if let selectedImage {
                PoseOverlayView(image: selectedImage, pose: pose)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
            } else {
                VStack(spacing: 10) {
                    Image(systemName: "person.crop.rectangle")
                        .font(.system(size: 44))
                        .foregroundStyle(.secondary)

                    Text("Choose a front-facing full-body photo")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .frame(minHeight: 420)
    }

    private var actionButtons: some View {
        VStack(spacing: 12) {
            HStack {
                PhotosPicker(selection: $selectedPhoto, matching: .images) {
                    Label("Gallery", systemImage: "photo.on.rectangle")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)

                Button {
                    showingCamera = true
                } label: {
                    Label("Camera", systemImage: "camera")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
            }

            Button {
                Task { await analyze() }
            } label: {
                if isAnalyzing {
                    ProgressView()
                        .frame(maxWidth: .infinity)
                } else {
                    Label("Estimate Measurements", systemImage: "ruler")
                        .frame(maxWidth: .infinity)
                }
            }
            .buttonStyle(.borderedProminent)
            .disabled(selectedImage == nil || isAnalyzing)
        }
    }

    private var disclaimer: some View {
        Text("These values are estimates for demo and sizing guidance only. They are not medical, tailoring, or bra-fitting measurements.")
            .font(.caption)
            .foregroundStyle(.secondary)
            .padding(.top, 8)
    }

    private func loadPhoto(_ item: PhotosPickerItem?) async {
        guard let item else { return }

        do {
            guard let data = try await item.loadTransferable(type: Data.self),
                  let uiImage = UIImage(data: data) else {
                errorMessage = "Could not load that photo."
                return
            }

            selectedImage = uiImage
            resetAnalysis()
        } catch {
            errorMessage = "Photo loading failed: \(error.localizedDescription)"
        }
    }

    private func analyze() async {
        guard let selectedImage else { return }
        guard let height = Double(heightText), height > 36, height < 96 else {
            errorMessage = "Enter height in inches, for example 66."
            return
        }

        isAnalyzing = true
        errorMessage = nil

        do {
            let detectedPose = try await poseEstimator.detectPose(in: selectedImage)
            let estimate = measurementEstimator.estimate(from: detectedPose, heightInches: height)

            pose = detectedPose
            result = estimate
        } catch {
            errorMessage = error.localizedDescription
            pose = nil
            result = nil
        }

        isAnalyzing = false
    }

    private func resetAnalysis() {
        pose = nil
        result = nil
        errorMessage = nil
    }
}

private struct ResultCard: View {
    let result: MeasurementResult

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Estimated Results")
                .font(.title2.bold())

            MeasurementRow(label: "Bust / chest", value: result.bust)
            MeasurementRow(label: "Waist", value: result.waist)
            MeasurementRow(label: "Hips", value: result.hips)
            MeasurementRow(label: "Shoulders", value: result.shoulders)
            MeasurementRow(label: "Inseam", value: result.inseam)
            MeasurementRow(label: "Underbust / band", value: result.underbust)

            Text("Confidence: \(result.confidence)")
                .font(.footnote.weight(.medium))
                .foregroundStyle(.secondary)
        }
        .padding()
        .background(Color(.secondarySystemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }
}

private struct MeasurementRow: View {
    let label: String
    let value: Double

    var body: some View {
        HStack {
            Text(label)
            Spacer()
            Text("\(value, specifier: "%.1f") in")
                .font(.headline)
        }
    }
}
