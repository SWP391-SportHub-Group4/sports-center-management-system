FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS base
USER $APP_UID
WORKDIR /app
EXPOSE 8080
EXPOSE 8081

FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
ARG BUILD_CONFIGURATION=Release
WORKDIR /src
COPY ["SportHub.API/SportHub.API.csproj", "SportHub.API/"]
COPY ["SportHub.BuildingBlocks/SportHub.BuildingBlocks.csproj", "SportHub.BuildingBlocks/"]
COPY ["SportHub.Identity/SportHub.Identity.csproj", "SportHub.Identity/"]
COPY ["SportHub.Membership/SportHub.Membership.csproj", "SportHub.Membership/"]
COPY ["SportHub.Scheduling/SportHub.Scheduling.csproj", "SportHub.Scheduling/"]
COPY ["SportHub.Training/SportHub.Training.csproj", "SportHub.Training/"]
COPY ["SportHub.Payment/SportHub.Payment.csproj", "SportHub.Payment/"]
COPY ["SportHub.Notification/SportHub.Notification.csproj", "SportHub.Notification/"]
COPY ["SportHub.AI/SportHub.AI.csproj", "SportHub.AI/"]
COPY ["SportHub.Audit/SportHub.Audit.csproj", "SportHub.Audit/"]
RUN dotnet restore "SportHub.API/SportHub.API.csproj"
COPY . .
WORKDIR "/src/SportHub.API"
RUN dotnet build "./SportHub.API.csproj" -c $BUILD_CONFIGURATION -o /app/build

FROM build AS publish
ARG BUILD_CONFIGURATION=Release
RUN dotnet publish "./SportHub.API.csproj" -c $BUILD_CONFIGURATION -o /app/publish /p:UseAppHost=false

FROM base AS final
WORKDIR /app
COPY --from=publish /app/publish .
ENTRYPOINT ["dotnet", "SportHub.API.dll"]
